# Баги B2C

Проверка витрины 2026-10-21. Яндекс ID в этот список не входит и не чинится.

## 1. После входа нет перехода в профиль

Вход по email на `/login` не уводит пользователя в профиль или на главную. Форма в `HandmadeGoodsPlatform/ecom-platform/components/features/EmailAuthForm.tsx` вызывает `router.push("/account")`, но параметр `next` из адреса игнорируется: middleware (`middleware.ts`) кладёт его при редиректе с `/account` и `/seller`. Клиентский `router.push` легко остаётся на странице входа.

Нужно после успешного входа и регистрации переходить на безопасный внутренний `next`, иначе в профиль `/account` (для намерения продавца — в онбординг). Переход должен быть полной загрузкой страницы, чтобы cookie `auth-token` уже была видна. Яндекс-кнопку не менять.

## 2. Удаление из корзины стирает все доставки одного товара

`removeItem` в `HandmadeGoodsPlatform/ecom-platform/store/cart.ts` фильтрует только по `productId`. `CartItemCard` вызывает `removeItem(product.id)`. Та же позиция с другим способом доставки исчезает вместе с удаляемой. `updateQuantity` меняет количество у всех строк этого товара.

Ключ строки — товар и способ доставки. Удаление и изменение количества должны затрагивать только эту строку.

## 3. Неверный пароль выглядит как «нужна авторизация»

`POST /api/auth/login` с неверным паролем отвечает 401 и текстом «Требуется авторизация». В `ecom-platform-B2C/services/b2c/clients.py` любой upstream 401 превращается в `unauthorized()` без текста сервиса пользователей. На форме это сообщение про сессию, а не про email или пароль.

Для неверных учётных данных нужен понятный текст вроде «Неверный email или пароль».

## 4. Пустой комментарий отвечает 503

`POST /api/posts/{id}/comments` с телом из пробелов: сервис публикаций отвечает 422 (`BadRequestError` после `strip` в `services/publications/routes.py`). B2C не разбирает 422, ретраит запрос и отдаёт 503 `Upstream http://publications:8000 failed`.

422 и прочие ошибки проверки нужно отдавать как 400 с текстом ошибки, без сообщения о недоступности сервиса.

## 5. Битый id товара даёт 500

`GET /api/products/not-a-uuid` падает с 500 `Internal server error`. В `contract_api/router.py` путь принимает строку и вызывает `uuid.UUID(...)`, `ValueError` никто не ловит. То же касается остальных ручек, где UUID парсится вручную из строки пути.

Некорректный UUID должен быть 400 «Невалидные данные», а не 500.

## 6. «Не найдено» приходит сырым JSON

`GET /api/products/{missing-uuid}`, `GET /api/posts/{missing}` и `GET /api/orders/{missing}` отдают 404, но `message` — это весь JSON upstream, например `{"error":{"code":"not_found","message":"Product ... not found",...}}`.

`Upstreams._request` при 404 делает `NotFoundError(response.text)`, а обработчик в `services/b2c/main.py` кладёт `str(exc)` в конверт. Нужно вытащить человекочитаемое `message` из JSON, а если его нет — короткий текст «Не найдено».

## 7. `total` у списка публикаций — это размер страницы

`GET /api/posts?page=1&pageSize=2` возвращает `total: 2`, хотя публикаций больше. `B2CFacade.list_posts` запрашивает ленту с `limit=page_size+offset` и ставит `total=len(items)`. Лента публикаций курсорная и общего числа не отдаёт (`PostFeed` в `services/publications/routes.py`).

В ответе с `page` поле `total` должно быть числом всех подходящих опубликованных постов, а не длиной текущей выборки.

## 8. Поиск в магазине уводит в общий поиск

На `/shops/[username]` вкладка товаров фильтрует список по `q`, но `SearchBar` всегда делает `router.push("/search?q=...")`. Запрос не остаётся на странице магазина.

Поиск на странице магазина должен обновлять `?tab=products&q=` этого магазина. Общий поиск с главной и `/search` остаётся как есть.

## 9. Фото товара на странице не показывается

У «Кедровой кружки» (`/product/33d20b5a-2c61-450f-bca1-f87751cd1c01`) цена и описание есть, а картинка товара не рисуется (`naturalWidth` 0). Файл лежит на MinIO `http://localhost:9000`. В `HandmadeGoodsPlatform/ecom-platform/next.config.ts` хост уже в `remotePatterns`, но Next.js не грузит картинки с локального IP без `images.dangerouslyAllowLocalIP`.

Картинка товара и обложки с localhost:9000 должны открываться в dev.
