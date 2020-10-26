const axios = require('axios');
const config = require('./config/config.js');

const internals = {};

internals.internalTimeout = () => (internals.lambdaTimeout - 2) * 1000;

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @param {string} event.resource - Resource path.
 * @param {string} event.path - Path parameter.
 * @param {string} event.httpMethod - Incoming request's method name.
 * @param {Object} event.headers - Incoming request headers.
 * @param {Object} event.queryStringParameters - query string parameters.
 * @param {Object} event.pathParameters - path parameters.
 * @param {Object} event.stageVariables - Applicable stage variables.
 * @param {Object} event.requestContext - Request context, including authorizer-returned key-value pairs, requestId, sourceIp, etc.
 * @param {Object} event.body - A JSON string of the request payload.
 * @param {boolean} event.body.isBase64Encoded - A boolean flag to indicate if the applicable request payload is Base64-encode
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 * @param {string} context.logGroupName - Cloudwatch Log Group name
 * @param {string} context.logStreamName - Cloudwatch Log stream name.
 * @param {string} context.functionName - Lambda function name.
 * @param {string} context.memoryLimitInMB - Function memory.
 * @param {string} context.functionVersion - Function version identifier.
 * @param {function} context.getRemainingTimeInMillis - Time in milliseconds before function times out.
 * @param {string} context.awsRequestId - Lambda request ID.
 * @param {string} context.invokedFunctionArn - Function ARN.
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * @returns {boolean} object.isBase64Encoded - A boolean flag to indicate if the applicable payload is Base64-encode (binary support)
 * @returns {string} object.statusCode - HTTP Status Code to be returned to the client
 * @returns {Object} object.headers - HTTP Headers to be returned
 * @returns {Object} object.body - JSON Payload to be returned
 *
 */

internals.deploySlaves = async (dTOItems) => {
  const numberOfRequestedSlaves = dTOItems.length;
  const timeout = internals.internalTimeout();
  if (numberOfRequestedSlaves < 1 || numberOfRequestedSlaves > 12) throw new Error(`The number of app-slaves requested was: ${numberOfRequestedSlaves}. The supported number of testSessions is from 1-12`);

  const http = axios.create({ timeout /* default is 0 (no timeout) */, baseURL: 'http://docker-compose-ui:5000/api/v1', headers: { 'Content-type': 'application/json' } });

  await http.put('/services', { service: 'zap', project: 'app-slave', num: numberOfRequestedSlaves })
    .catch((e) => {
      if (e.message === `timeout of ${timeout}ms exceeded`) throw new Error('timeout exceeded');
      throw e;
    });

  return dTOItems.map((cV, i) => {
    const itemClone = { ...cV };
    itemClone.appSlaveContainerName = `appslave-zap-${i + 1}`;
    return itemClone;
  });
};

exports.provisionAppSlaves = async (event, context) => { // eslint-disable-line no-unused-vars
  // Todo: KC: Do we need convict?
  internals.lambdaTimeout = config.get('lambdaTimeout');
  const { provisionViaLambdaDto: { items } } = event;
  let result;
  try {
    result = await internals.deploySlaves(items);
  } catch (e) {
    if (e.message === 'timeout exceeded') result = 'Timeout exceeded: App Slave container(s) took too long to start.';
    // Todo: We may need a default for unexpected cases. See the cloud function for ideas.
  }

  const response = {
    // 'statusCode': 200,
    body: { provisionedViaLambdaDto: { items: result } }
  };

  return response;
};