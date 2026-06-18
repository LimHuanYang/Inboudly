import { EmbeddingsService } from './embeddings.service';

describe('EmbeddingsService', () => {
  it('exposes Gemini embedding model + 3072 dims (matches Pinecone index)', () => {
    expect(EmbeddingsService.MODEL).toBe('gemini-embedding-001');
    expect(EmbeddingsService.DIMENSION).toBe(3072);
  });

  it('embedMany returns [] for empty input without calling the API', async () => {
    const svc = new EmbeddingsService();
    await expect(svc.embedMany('unused-key', [])).resolves.toEqual([]);
  });
});
