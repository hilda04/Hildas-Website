const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');

const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: 'v4' });

const {
  TABLE_NAME,
  BUCKET_NAME,
  MEDIA_PREFIX = 'projects',
  MEDIA_BASE_URL = '',
  ADMIN_API_KEY = '',
  ALLOWED_ORIGIN = '*'
} = process.env;

const allowedOrigins = (ALLOWED_ORIGIN || '*')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

function pickOrigin(requestOrigin){
  if (allowedOrigins.includes('*')) return '*';
  if (!requestOrigin) return allowedOrigins[0] || '*';
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
}

function buildResponse(statusCode, body, origin){
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'false',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: body ? JSON.stringify(body) : ''
  };
}

function parseBody(event){
  if (!event.body) return {};
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch (err) {
      throw new HttpError(400, 'Invalid JSON body');
    }
  }
  return event.body;
}

function sanitizeString(value, maxLength){
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  if (!str) return '';
  return str.slice(0, maxLength || 500);
}

function sanitizeUrl(value){
  if (!value) return undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  if (!/^https?:\/\//i.test(str)) return undefined;
  return str.slice(0, 500);
}

function normalizeTags(value){
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(v => sanitizeTag(v)).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map(part => sanitizeTag(part))
    .filter(Boolean);
}

function sanitizeTag(value){
  if (!value && value !== 0) return '';
  const str = String(value).trim();
  if (!str) return '';
  return str.replace(/[^a-z0-9\- ]/gi, '').replace(/\s+/g, '-').slice(0, 40).toLowerCase();
}

function sanitizeKey(value){
  if (value === undefined || value === null) return value;
  const str = String(value).trim();
  return str.replace(/^\/+/, '');
}

function requireAdmin(event, origin){
  if (!ADMIN_API_KEY) return null;
  const provided = (event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'] || '').trim();
  if (provided !== ADMIN_API_KEY) {
    return buildResponse(401, { message: 'Unauthorized' }, origin);
  }
  return null;
}

class HttpError extends Error {
  constructor(statusCode, message){
    super(message);
    this.statusCode = statusCode;
  }
}

async function listItems(){
  const data = await ddb.scan({ TableName: TABLE_NAME }).promise();
  const items = (data.Items || []).map(mapItem).sort((a, b) => {
    const left = new Date(a.createdAt || 0).valueOf();
    const right = new Date(b.createdAt || 0).valueOf();
    if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
    return right - left;
  });
  return items;
}

function mapItem(item){
  if (!item) return item;
  const mapped = { ...item };
  if (MEDIA_BASE_URL && item.imageKey && !item.imageUrl) {
    mapped.imageUrl = `${MEDIA_BASE_URL.replace(/\/+$/, '')}/${item.imageKey.replace(/^\/+/, '')}`;
  }
  return mapped;
}

async function createItem(payload){
  const now = new Date().toISOString();
  const item = {
    id: uuidv4(),
    title: sanitizeString(payload.title, 200) || 'Untitled project',
    summary: sanitizeString(payload.summary, 600) || '',
    link: sanitizeUrl(payload.link),
    tags: normalizeTags(payload.tags),
    featured: Boolean(payload.featured),
    imageKey: sanitizeKey(payload.imageKey) || null,
    imageAlt: sanitizeString(payload.imageAlt, 120) || null,
    createdAt: now,
    updatedAt: now
  };

  if (!item.summary) {
    throw new HttpError(400, 'Summary is required.');
  }

  await ddb.put({
    TableName: TABLE_NAME,
    Item: item
  }).promise();

  return mapItem(item);
}

async function updateItem(id, payload){
  if (!id) throw new HttpError(400, 'Missing item id');
  const now = new Date().toISOString();
  const updates = {};

  if (payload.title !== undefined) updates.title = sanitizeString(payload.title, 200) || 'Untitled project';
  if (payload.summary !== undefined) {
    const summary = sanitizeString(payload.summary, 600) || '';
    if (!summary) throw new HttpError(400, 'Summary is required.');
    updates.summary = summary;
  }
  if (payload.link !== undefined) updates.link = sanitizeUrl(payload.link) || null;
  if (payload.tags !== undefined) updates.tags = normalizeTags(payload.tags);
  if (payload.featured !== undefined) updates.featured = Boolean(payload.featured);
  if (payload.imageKey !== undefined) updates.imageKey = sanitizeKey(payload.imageKey) || null;
  if (payload.imageAlt !== undefined) updates.imageAlt = sanitizeString(payload.imageAlt, 120) || null;

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, 'No updates provided');
  }

  const updateExpressions = [];
  const expressionAttributeNames = { '#updatedAt': 'updatedAt' };
  const expressionAttributeValues = { ':updatedAt': now };
  let index = 0;

  for (const [key, value] of Object.entries(updates)) {
    index += 1;
    const nameKey = `#f${index}`;
    const valueKey = `:v${index}`;
    expressionAttributeNames[nameKey] = key;
    expressionAttributeValues[valueKey] = value;
    updateExpressions.push(`${nameKey} = ${valueKey}`);
  }

  const result = await ddb.update({
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}, #updatedAt = :updatedAt`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }).promise();

  if (!result.Attributes) throw new HttpError(404, 'Item not found');
  return mapItem(result.Attributes);
}

async function deleteItem(id){
  if (!id) throw new HttpError(400, 'Missing item id');
  const existing = await ddb.get({
    TableName: TABLE_NAME,
    Key: { id }
  }).promise();

  if (!existing.Item) throw new HttpError(404, 'Item not found');

  await ddb.delete({
    TableName: TABLE_NAME,
    Key: { id }
  }).promise();

  if (existing.Item.imageKey) {
    const key = existing.Item.imageKey;
    try {
      await s3.deleteObject({ Bucket: BUCKET_NAME, Key: key }).promise();
    } catch (err) {
      console.warn('Failed to delete image', key, err);
    }
  }
}

function sanitizeFilename(name){
  const ext = path.extname(name || '').slice(0, 10);
  const base = path.basename(name || 'upload', ext);
  const cleanBase = base.replace(/[^a-z0-9\-]+/gi, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'upload';
  return `${cleanBase}${ext.toLowerCase()}`;
}

async function createUploadUrl(id, filename, contentType){
  if (!id) throw new HttpError(400, 'Missing item id');
  if (!filename) throw new HttpError(400, 'Filename is required');

  const safeName = sanitizeFilename(filename);
  const hash = crypto.randomBytes(4).toString('hex');
  const prefix = MEDIA_PREFIX.replace(/\/+$/, '');
  const key = `${prefix}/${id}/${Date.now()}-${hash}-${safeName}`;

  const uploadUrl = await s3.getSignedUrlPromise('putObject', {
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
    Expires: 300,
    ACL: 'public-read'
  });

  const publicUrl = MEDIA_BASE_URL
    ? `${MEDIA_BASE_URL.replace(/\/+$/, '')}/${key}`
    : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, objectKey: key, publicUrl };
}

exports.handler = async (event) => {
  const origin = pickOrigin(event.headers?.origin || event.headers?.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return buildResponse(200, { ok: true }, origin);
  }

  try {
    const path = event.resource || event.path;
    const id = event.pathParameters?.id;

    if (event.httpMethod === 'GET' && path === '/items') {
      const items = await listItems();
      return buildResponse(200, { items }, origin);
    }

    if (event.httpMethod === 'POST' && path === '/items') {
      const authError = requireAdmin(event, origin);
      if (authError) return authError;
      const payload = parseBody(event);
      const item = await createItem(payload);
      return buildResponse(201, { item }, origin);
    }

    if (event.httpMethod === 'PUT' && path === '/items/{id}') {
      const authError = requireAdmin(event, origin);
      if (authError) return authError;
      const payload = parseBody(event);
      const item = await updateItem(id, payload);
      return buildResponse(200, { item }, origin);
    }

    if (event.httpMethod === 'DELETE' && path === '/items/{id}') {
      const authError = requireAdmin(event, origin);
      if (authError) return authError;
      await deleteItem(id);
      return buildResponse(200, { success: true }, origin);
    }

    if (event.httpMethod === 'POST' && path === '/items/{id}/upload-url') {
      const authError = requireAdmin(event, origin);
      if (authError) return authError;
      const payload = parseBody(event);
      const result = await createUploadUrl(id, payload.filename, payload.contentType);
      return buildResponse(200, result, origin);
    }

    throw new HttpError(404, 'Not found');
  } catch (err) {
    console.error('Request failed', err);
    if (err instanceof HttpError) {
      return buildResponse(err.statusCode || 500, { message: err.message }, origin);
    }
    return buildResponse(500, { message: 'Internal server error' }, origin);
  }
};
