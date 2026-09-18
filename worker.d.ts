interface LineWebhookWorkerEnv {
  LINE_CHANNEL_SECRET?: string;
}

declare const worker: {
  fetch(request: Request, env: LineWebhookWorkerEnv): Promise<Response>;
};

export default worker;
