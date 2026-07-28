/**
 * Le a resposta como texto primeiro e só então tenta JSON.parse - se a API devolver HTML
 * (pagina de erro de gateway, 404 generico, etc.) o erro mostra o corpo real recebido em
 * vez do inutil "Unexpected token '<' is not valid JSON".
 */
export async function safeFetchJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Resposta não-JSON (status ${response.status} ${response.statusText}): ${text.slice(0, 500)}`
    );
  }
}
