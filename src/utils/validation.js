// src/utils/validation.js
export function validateCustomerData(data) {
  const errors = [];
  
  if (!data.firstName?.trim()) {
    errors.push({ field: 'firstName', message: 'Vorname ist erforderlich' });
  }
  
  if (!data.lastName?.trim()) {
    errors.push({ field: 'lastName', message: 'Nachname ist erforderlich' });
  }
  
  if (!data.street?.trim()) {
    errors.push({ field: 'street', message: 'Straße ist erforderlich' });
  }
  
  if (!data.zipCode?.trim() || !/^\d{5}$/.test(data.zipCode)) {
    errors.push({ field: 'zipCode', message: 'Gültige PLZ (5 Ziffern) erforderlich' });
  }
  
  if (!data.city?.trim()) {
    errors.push({ field: 'city', message: 'Stadt ist erforderlich' });
  }
  
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ field: 'email', message: 'Ungültige E-Mail-Adresse' });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateRequired(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, message: `${fieldName} ist erforderlich` };
  }
  return { isValid: true };
}