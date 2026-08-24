export function createChatCompletionBody(settings, messages, maxTokens, stream = false, temperature = 0.8) {
  const model = settings.apiModel || 'gpt-4.1-nano';
  const body = { model, messages };

  if (settings.apiProvider === 'openai') {
    body.max_completion_tokens = maxTokens;

    if (!/^gpt-5(?:[.-]|$)/i.test(model)) {
      body.temperature = temperature;
    }
  } else {
    body.max_tokens = maxTokens;
    body.temperature = temperature;
  }

  if (stream) body.stream = true;
  return body;
}
