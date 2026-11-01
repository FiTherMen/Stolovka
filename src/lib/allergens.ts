/** 14 алергенів ЄС (Регламент 1169/2011). Ключі зберігаються в базі. */
export const ALLERGENS: Record<string, string> = {
  gluten: 'глютен',
  crustaceans: 'ракоподібні',
  eggs: 'яйця',
  fish: 'риба',
  peanuts: 'арахіс',
  soy: 'соя',
  milk: 'молоко/лактоза',
  nuts: 'горіхи',
  celery: 'селера',
  mustard: 'гірчиця',
  sesame: 'кунжут',
  sulphites: 'сульфіти',
  lupin: 'люпин',
  molluscs: 'молюски',
}

export const TAGS: Record<string, string> = {
  vegetarian: 'вегетаріанське',
  spicy: 'гостре',
  kids: 'дитяче',
}

export const allergenLabel = (key: string) => ALLERGENS[key] ?? key
