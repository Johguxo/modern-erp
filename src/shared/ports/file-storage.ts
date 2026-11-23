// Puerto de archivos. El adaptador guarda en `${tenantId}/${key}` (modelo-datos, tabla files):
// el aislamiento entre tenants lo da la ruta.
export interface FileStorage {
  put(input: {
    tenantId: string;
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<void>;
  getSignedUrl(input: { tenantId: string; key: string; expiresInSeconds: number }): Promise<string>;
  remove(input: { tenantId: string; key: string }): Promise<void>;
}
