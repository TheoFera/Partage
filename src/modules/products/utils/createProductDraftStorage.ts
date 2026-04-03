export const getCreateProductDraftStorageKey = (ownerId?: string | null) =>
  `product-create-draft:${(ownerId ?? 'current-user').trim() || 'current-user'}`;
