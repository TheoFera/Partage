import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CreateProductPayload, Product, ProductDetail, User } from '../types';
import { ProductDetailView } from './ProductDetailView';
import { PRODUCT_CATEGORIES } from '../constants/productCategories';

interface AddProductFormProps {
  onAddProduct: (payload: CreateProductPayload) => void;
  supabaseClient?: SupabaseClient | null;
  currentUser?: User | null;
}

export function AddProductForm({ onAddProduct, supabaseClient, currentUser }: AddProductFormProps) {
  const producerProfile = React.useMemo(() => {
    const name = currentUser?.name?.trim() || 'Ma Ferme';
    const city = currentUser?.city?.trim() || currentUser?.address?.trim() || 'A proximite';
    const photo = currentUser?.profileImage?.trim() || undefined;
    return {
      id: currentUser?.id ?? currentUser?.producerId ?? 'current-user',
      name,
      city,
      photo,
    };
  }, [currentUser]);

  const blankProduct = React.useMemo<Product>(
    () => ({
      id: 'draft',
      name: '',
      description: '',
      price: 0,
      unit: 'kg',
      category: '',
      imageUrl: '',
      producerId: producerProfile.id,
      producerName: producerProfile.name,
      producerLocation: producerProfile.city,
      inStock: false,
      measurement: 'kg',
    }) as Product,
    [producerProfile]
  );

  const blankDetail = React.useMemo<ProductDetail>(
    () => ({
      productId: blankProduct.id,
      name: '',
      category: '',
      shortDescription: '',
      longDescription: '',
      producer: {
        id: blankProduct.producerId,
        name: blankProduct.producerName,
        city: blankProduct.producerLocation,
        photo: producerProfile.photo,
      },
      productions: [],
      repartitionValeur: { mode: 'estimatif', uniteReference: 'kg', postes: [] },
    }),
    [blankProduct, producerProfile]
  );

  return (
    <ProductDetailView
      mode="create"
      product={blankProduct}
      detail={blankDetail}
      ordersWithProduct={[]}
      isOwner
      supabaseClient={supabaseClient ?? null}
      onShare={() => {}}
      onCreateOrder={() => {}}
      onParticipate={() => {}}
      onCreateProduct={onAddProduct}
      categoryOptions={PRODUCT_CATEGORIES}
    />
  );
}
