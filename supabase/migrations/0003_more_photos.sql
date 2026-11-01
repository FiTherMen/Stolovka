-- До 5 фото на страву (було до 3). Перше фото — обкладинка в меню. Безпечно повторювати.
alter table public.dishes drop constraint if exists dishes_photo_urls_check;
alter table public.dishes add constraint dishes_photo_urls_check check (cardinality(photo_urls) <= 5);
