// Envia um <form> pelo caminho padrão do navegador. requestSubmit() valida e
// dispara o evento "submit" como um clique no botão de envio; submit() é o
// fallback de navegadores antigos. Nenhum dos dois depende da ação padrão de
// um clique — por isso funcionam a partir de um item de menu.
export type SubmittableForm = Pick<HTMLFormElement, "submit"> & { requestSubmit?: () => void; isConnected?: boolean };

export function submitForm(form: SubmittableForm | null | undefined): boolean {
  if (!form || form.isConnected === false) return false;
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.submit();
  return true;
}
