const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const bluebird = require('bluebird');
const utils = require('../utils');
const {
  buildHistory,
  buildWorkflowExecutionRequest,
  momentToProtoTime,
  uiTransform,
  cliTransform,
} = require('./helpers');
const { getGrpcCredentials } = require('../tls');
const { v4: uuidv4 } = require('uuid');

function TemporalClient(tlsConfig) {
  const dir = process.cwd();
  const protoFileName = 'service.proto';
  const options = {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [
      `${dir}/proto/`,
      `${dir}/proto/temporal/api/command/v1`,
      `${dir}/proto/temporal/api/common/v1`,
      `${dir}/proto/temporal/api/enums/v1`,
      `${dir}/proto/temporal/api/errordetails/v1`,
      `${dir}/proto/temporal/api/failure/v1`,
      `${dir}/proto/temporal/api/filter/v1`,
      `${dir}/proto/temporal/api/history/v1`,
      `${dir}/proto/temporal/api/namespace/v1`,
      `${dir}/proto/temporal/api/query/v1`,
      `${dir}/proto/temporal/api/replication/v1`,
      `${dir}/proto/temporal/api/taskqueue/v1`,
      `${dir}/proto/temporal/api/version/v1`,
      `${dir}/proto/temporal/api/workflow/v1`,
      `${dir}/proto/temporal/api/workflowservice/v1`,
    ],
  };

  const packageDefinition = protoLoader.loadSync(protoFileName, options);
  const service = grpc.loadPackageDefinition(packageDefinition);

  const { credentials: tlsCreds, options: tlsOpts } = getGrpcCredentials(tlsConfig);

  tlsOpts['grpc.max_receive_message_length'] =
    Number(process.env.TEMPORAL_GRPC_MAX_MESSAGE_LENGTH) || 4 * 1024 * 1024;

  let client = new service.temporal.api.workflowservice.v1.WorkflowService(
    process.env.TEMPORAL_GRPC_ENDPOINT || '127.0.0.1:7233',
    tlsCreds,
    tlsOpts
  );

  client = bluebird.promisifyAll(client);
  this.client = client;
}

TemporalClient.prototype.describeNamespace = async function(
  ctx,
  { namespace }
) {
  const req = { namespace };

  const res = await this.client.describeNamespaceAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.listNamespaces = async function(
  ctx,
  { pageSize, nextPageToken }
) {
  const req = { pageSize, nextPageToken };

  const res = await this.client.listNamespacesAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.openWorkflows = async function(
  ctx,
  {
    namespace,
    startTime,
    endTime,
    executionFilter,
    typeFilter,
    nextPageToken,
    maximumPageSize = 10,
  }
) {
  const startTimeFilter = {
    earliestTime: momentToProtoTime(startTime),
    latestTime: momentToProtoTime(endTime),
  };
  const req = {
    namespace,
    nextPageToken,
    maximumPageSize,
    startTimeFilter,
    typeFilter,
    executionFilter,
  };
  const res = await this.client.listOpenWorkflowExecutionsAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.closedWorkflows = async function(
  ctx,
  {
    namespace,
    startTime,
    endTime,
    executionFilter,
    typeFilter,
    status,
    nextPageToken,
    maximumPageSize = 10,
  }
) {
  const startTimeFilter = {
    earliestTime: momentToProtoTime(startTime),
    latestTime: momentToProtoTime(endTime),
  };
  const req = {
    namespace,
    nextPageToken,
    maximumPageSize,
    startTimeFilter,
    executionFilter,
    typeFilter,
    statusFilter: status ? { status } : undefined,
  };

  const res = await this.client.listClosedWorkflowExecutionsAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.listWorkflows = async function(
  ctx,
  { namespace, query, nextPageToken, pageSize = 20, maximumPageSize = 100 }
) {
  const req = {
    namespace,
    query,
    nextPageToken,
    pageSize,
    maximumPageSize,
  };

  const res = await this.client.listWorkflowExecutionsAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.getHistory = async function(
  ctx,
  {
    namespace,
    nextPageToken,
    execution,
    waitForNewEvent,
    rawPayloads,
    maximumPageSize = 100,
  }
) {
  const req = {
    namespace,
    nextPageToken,
    execution: buildWorkflowExecutionRequest(execution),
    waitForNewEvent,
    maximumPageSize,
  };

  let res = await this.client.getWorkflowExecutionHistoryAsync(ctx, req);

  res = uiTransform(res, rawPayloads);

  if (res.history && res.history.events) {
    res.history = buildHistory(res);
  }

  return res;
};

TemporalClient.prototype.archivedWorkflows = async function(
  ctx,
  { namespace, nextPageToken, query, pageSize = 100 }
) {
  const req = {
    namespace,
    nextPageToken,
    query,
    pageSize,
  };

  const res = await this.client.listArchivedWorkflowExecutionsAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.exportHistory = async function(
  ctx,
  { namespace, execution, nextPageToken }
) {
  const req = {
    namespace,
    execution: buildWorkflowExecutionRequest(execution),
    nextPageToken,
  };

  const res = await this.client.getWorkflowExecutionHistoryAsync(ctx, req);

  return cliTransform(res);
};

TemporalClient.prototype.queryWorkflow = async function(
  ctx,
  { namespace, execution, query }
) {
  const req = {
    namespace,
    execution: buildWorkflowExecutionRequest(execution),
    query,
  };
  const res = await this.client.queryWorkflowAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.terminateWorkflow = async function(
  ctx,
  { namespace, execution, reason }
) {
  if (!utils.isWriteApiPermitted()) {
    throw Error('Terminate method is disabled');
  }

  const req = {
    namespace,
    workflowExecution: buildWorkflowExecutionRequest(execution),
    reason,
  };

  const res = await this.client.terminateWorkflowExecutionAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.restartWorkflow = async function(
  ctx,
  { namespace, execution, firstEvent }
) {
  if (!utils.isWriteApiPermitted()) {
    throw Error('Restart method is disabled');
  }

  const terminateReq = {
    namespace,
    workflowExecution: buildWorkflowExecutionRequest(execution),
    reason: "Workflow restart requested",
  };

  try {
    await this.client.terminateWorkflowExecutionAsync(ctx, terminateReq);
  }
  catch (err) {
    // Already completed workflows can't be terminated.
  }

  const createReq = {
    namespace,
    workflowId: execution.workflowId,
    workflowType: firstEvent.details.workflowType,
    taskQueue: firstEvent.details.taskQueue,
    input: firstEvent.details.input,
    workflowExecutionTimeout: firstEvent.details.workflowExecutionTimeout,
    workflowRunTimeout: firstEvent.details.workflowRunTimeout,
    workflowTaskTimeout: firstEvent.details.workflowTaskTimeout,
    identity: firstEvent.details.identity,
    requestId: uuidv4(),
    retryPolicy: firstEvent.details.retryPolicy,
    cronSchedule: firstEvent.details.cronSchedule,
    memo: firstEvent.details.memo,
    searchAttributes: firstEvent.details.searchAttributes,
    header: firstEvent.details.header,
  }

  const createRes = await this.client.startWorkflowExecutionAsync(ctx, createReq);

  return uiTransform(createRes);
};

TemporalClient.prototype.signalWorkflow = async function(
  ctx,
  { namespace, execution, signalName, payload }
) {
  const req = {
    namespace,
    workflowExecution: buildWorkflowExecutionRequest(execution),
    signalName,
    input: {
      payloads: [
        {
          metadata: { encoding: Buffer.from("json/plain") },
          data: Buffer.from(JSON.stringify(payload))
        }
      ]
    },
  };

  const res = await this.client.signalWorkflowExecutionAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.resetWorkflow = async function(
  ctx,
  { namespace, execution, eventId, reason, reapplySignals }
) {
  const req = {
    namespace,
    workflowExecution: buildWorkflowExecutionRequest(execution),
    reason,
    workflowTaskFinishEventId: eventId,
    requestId: uuidv4(),
    resetReapplyType: reapplySignals ? 1 : 2, // 1 = RESET_REAPPLY_TYPE_SIGNAL, 2 = RESET_REAPPLY_TYPE_NONE
  };

  const res = await this.client.resetWorkflowExecutionAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.describeWorkflow = async function(
  ctx,
  { namespace, execution }
) {
  const req = {
    namespace,
    execution: buildWorkflowExecutionRequest(execution),
  };

  const res = await this.client.describeWorkflowExecutionAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.describeTaskQueue = async function(
  ctx,
  { namespace, taskQueue, taskQueueType }
) {
  const req = { namespace, taskQueue, taskQueueType };
  const res = await this.client.describeTaskQueueAsync(ctx, req);

  return uiTransform(res);
};

TemporalClient.prototype.getVersionInfo = async function(ctx) {
  const res = await this.client.getClusterInfoAsync(ctx, {});

  return uiTransform(res.versionInfo);
};

module.exports = { TemporalClient };
