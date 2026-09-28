// Adapted from the product module; see docs/PROVENANCE.md.
export function normalizeCatalogSearch(value        ) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match the prices and availability shown by the product card. */
export function catalogProductPrices(product         ) {
  const variants = product.variants ?? [];
  const available = variants.filter(
    (variant) => variant.available !== false && variant.stock !== 0,
  );
  return variants.length
    ? (available.length ? available : variants).map(
        (variant) => variant.salePrice ?? variant.price ?? product.salePrice ?? product.price,
      )
    : [product.salePrice ?? product.price];
}

export function catalogProductAvailability(product         ) {
  const variants = product.variants ?? [];
  const available = variants.filter(
    (variant) => variant.available !== false && variant.stock !== 0,
  );
  const soldOut = Boolean(
    (product.stockEnabled && product.stockQuantity === 0) || (variants.length && !available.length),
  );
  const threshold = product.lowStockThreshold ?? 3;
  const low =
    !soldOut &&
    Boolean(
      (product.stockEnabled &&
        product.stockQuantity != null &&
        product.stockQuantity > 0 &&
        product.stockQuantity <= threshold) ||
      available.some(
        (variant) => variant.stock != null && variant.stock > 0 && variant.stock <= threshold,
      ),
    );
  return { soldOut, low };
}

export function filterProducts(products           , filter               ) {
  const tokens = normalizeCatalogSearch(filter.query ?? "")
    .split(" ")
    .filter(Boolean);
  const selected = products.filter((product) => {
    const paths = product.categoryPaths?.length
      ? product.categoryPaths
      : [{ category: product.category, subcategory: product.subcategory }];
    const searchable = normalizeCatalogSearch(
      [
        product.name,
        product.brand,
        product.sku,
        product.reference,
        product.shortDescription,
        product.productType,
        ...(product.needs ?? []),
        ...(product.skinTypes ?? []),
        ...(product.variants ?? []).flatMap((variant) => [variant.name, variant.sku]),
        ...paths.flatMap((path) => [path.category, path.subcategory]),
      ]
        .filter(Boolean)
        .join(" "),
    );
    const matchesQuery = tokens.every((token) => searchable.includes(token));
    const matchesCategory =
      !filter.category ||
      filter.category === "Todos" ||
      (filter.category === "Lo más vendido"
        ? product.bestSeller
        : filter.category === "Destacados"
          ? product.featured
          : filter.category === "Promociones"
            ? product.salePrice != null ||
              product.variants?.some((variant) => variant.salePrice != null)
            : paths.some((path) => path.category === filter.category));
    const matchesBrand = !filter.brands?.length || filter.brands.includes(product.brand);
    const matchesNeeds =
      !filter.needs?.length || filter.needs.some((need) => product.needs?.includes(need));
    const matchesSkin =
      !filter.skinTypes?.length ||
      filter.skinTypes.some((skinType) => product.skinTypes?.includes(skinType));
    const matchesPrice = catalogProductPrices(product).some(
      (price) =>
        (filter.minPrice === undefined || price >= filter.minPrice) &&
        (filter.maxPrice === undefined || price <= filter.maxPrice),
    );
    const { soldOut: outOfStock, low: lowStock } = catalogProductAvailability(product);
    const matchesAvailability =
      !filter.availability ||
      (filter.availability === "sold-out"
        ? outOfStock
        : filter.availability === "low"
          ? lowStock
          : !outOfStock);
    return (
      matchesQuery &&
      matchesCategory &&
      matchesBrand &&
      matchesNeeds &&
      matchesSkin &&
      matchesPrice &&
      matchesAvailability &&
      (!filter.subcategory ||
        paths.some(
          (path) => path.category === filter.category && path.subcategory === filter.subcategory,
        ))
    );
  });
  return [...selected].sort((a, b) => {
    if (filter.sort === "price-asc")
      return Math.min(...catalogProductPrices(a)) - Math.min(...catalogProductPrices(b));
    if (filter.sort === "price-desc")
      return Math.min(...catalogProductPrices(b)) - Math.min(...catalogProductPrices(a));
    if (filter.sort === "rating-desc")
      return (
        Number(b.reviewRating ?? 0) - Number(a.reviewRating ?? 0) ||
        Number(b.reviewCount ?? 0) - Number(a.reviewCount ?? 0)
      );
    if (filter.sort === "name-asc") return a.name.localeCompare(b.name, "es");
    return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.sortOrder - b.sortOrder;
  });
}
