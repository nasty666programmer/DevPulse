export async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text) return `${res.status} ${res.statusText}: ${text.slice(0, 200)}`;
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}
