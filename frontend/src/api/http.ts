export async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text) return `${res.status} ${res.statusText}: ${text.slice(0, 200)}`;
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

const SUMMARIZE_ERROR_MESSAGES: Record<number, string> = {
  400: 'Текст слишком короткий для саммаризации.',
  404: 'Материал не найден.',
  503: 'Сервис саммаризации сейчас недоступен, попробуйте позже.',
};

export async function parseSummarizeError(res: Response): Promise<string> {
  const knownMessage = SUMMARIZE_ERROR_MESSAGES[res.status];
  if (knownMessage) {
    return knownMessage;
  }
  return parseErrorMessage(res);
}
