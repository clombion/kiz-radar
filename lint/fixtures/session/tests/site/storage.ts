// Exempt: a test plants and reads the page's storage.
export const planted = (key: string): string | null => sessionStorage.getItem(key);
