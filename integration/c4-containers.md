# C4: контейнеры

Один и тот же сервис повторяется на разных схемах, если он участвует в сценарии. Базы B2C, платежей и планировщика лежат в одном Postgres. У B2B своя база.

## Вся система

```mermaid
flowchart TB
  buyer["Покупатель<br/>Лента, каталог, корзина, заказы"]
  seller["Продавец<br/>Магазин, товары, публикации, заказы"]
  moderator["Модератор<br/>Магазины, профили, товары, публикации"]

  subgraph client["Клиент"]
    web["Витрина<br/>Next.js, :3000<br/>Покупатель, кабинет продавца и модерация"]
  end

  subgraph b2c["B2C"]
    b2capi["B2C API<br/>FastAPI, :8080<br/>BFF витрины"]
    users["Users<br/>FastAPI, :8001<br/>Аккаунт, сессия и продавцы"]
    cart["Cart<br/>FastAPI, :8003<br/>Корзина"]
    orders["Orders<br/>FastAPI, :8004<br/>Заказы, СДЭК и статусы"]
    goods["Goods<br/>FastAPI, :8006<br/>Витринный каталог"]
    pubs["Publications<br/>FastAPI, :8002<br/>Витринная лента"]
    search["Search<br/>FastAPI, :8007<br/>Поиск по каталогу"]
    eventer["Eventer<br/>FastAPI, :8005<br/>События витрины"]
    pg[("Postgres<br/>PostgreSQL, :5432<br/>Базы B2C, платежей и планировщика")]
    redis[("Redis<br/>Redis, :6379<br/>Кэш и сессии событий")]
    kafka[["Kafka<br/>Kafka, :9094<br/>События товаров и публикаций"]]
    meili[("Meilisearch<br/>Meilisearch, :7700<br/>Индекс поиска")]
    gorse["Gorse<br/>Gorse, :8088<br/>Рекомендации вошедшему"]
  end

  subgraph b2b["B2B"]
    b2bapi["B2B API<br/>FastAPI, :8090<br/>Кабинет продавца и модерация"]
    b2bgoods["B2B Goods<br/>FastAPI, :8081<br/>Каталог продавца"]
    b2bpubs["B2B Publications<br/>FastAPI, :8082<br/>Публикации продавца"]
    b2bpg[("B2B Postgres<br/>PostgreSQL<br/>Магазины, товары, посты и медиа")]
    minio[("MinIO<br/>S3, :9000<br/>Фото товаров и обложки")]
  end

  subgraph pay["Обработка заказов"]
    processor["Order processor<br/>FastAPI, :8095<br/>Оплата заказа и Premium, заглушка OAuth ЮKassa"]
    scheduler["Scheduler<br/>FastAPI, :8096<br/>Регистрация и исполнение автопродления"]
  end

  yandex["Яндекс ID<br/>Вход покупателя"]
  maps["Яндекс Карты<br/>Пункты СДЭК"]
  cdek["СДЭК<br/>Расчёт и заявка"]
  yookassa["ЮKassa<br/>Платёж Premium и магазины продавцов"]

  buyer -->|Открывает| web
  seller -->|Ведёт магазин| web
  moderator -->|Модерирует| web
  web -->|Покупательские экраны| b2capi
  web -->|Кабинет и модерация| b2bapi
  b2capi -->|Аккаунт| users
  b2capi -->|Корзина| cart
  b2capi -->|Заказы| orders
  b2capi -->|Каталог| goods
  b2capi -->|Лента| pubs
  b2capi -->|Поиск| search
  b2capi -->|Рекомендации| gorse
  b2capi -->|OAuth| yandex
  b2capi -->|Геокодер и ПВЗ| maps
  users --> pg
  cart --> pg
  orders --> pg
  goods --> pg
  pubs --> pg
  search -->|Ищет| meili
  eventer -->|Пишет события| kafka
  eventer -->|Отмечает интерес| gorse
  eventer -->|Хранит состояние| redis
  kafka -->|product.*| goods
  kafka -->|publication.*| pubs
  orders -->|Создаёт платёж| processor
  orders -->|Считает и оформляет| cdek
  b2bapi -->|Товары| b2bgoods
  b2bapi -->|Публикации| b2bpubs
  b2bapi -->|Проверяет сессию| users
  b2bapi -->|Заказы продавца| orders
  b2bapi -->|Premium и ЮKassa| processor
  b2bapi -->|Загружает фото| minio
  b2bgoods --> b2bpg
  b2bpubs --> b2bpg
  b2bapi --> b2bpg
  b2bgoods -->|product.*| kafka
  b2bpubs -->|publication.*| kafka
  processor -->|Платёж и OAuth| yookassa
  processor -->|Платежи| pg
  scheduler -->|Берёт задачи продления| b2bapi
  scheduler -->|Списывает следующий месяц| processor
  scheduler -->|Свои задачи| pg
```

## B2C

```mermaid
flowchart TB
  buyer["Покупатель<br/>Смотрит ленту и оформляет заказ"]
  web["Витрина<br/>Next.js, :3000<br/>Лента, карточка, корзина, чекаут и профиль"]
  b2capi["B2C API<br/>FastAPI, :8080<br/>Собирает ответ витрины"]
  users["Users<br/>FastAPI, :8001<br/>Сессия и карточка продавца"]
  cart["Cart<br/>FastAPI, :8003<br/>Позиции корзины"]
  orders["Orders<br/>FastAPI, :8004<br/>Чекаут и статус заказа"]
  goods["Goods<br/>FastAPI, :8006<br/>Каталог, который видит покупатель"]
  pubs["Publications<br/>FastAPI, :8002<br/>Лента публикаций"]
  search["Search<br/>FastAPI, :8007<br/>Поиск товаров"]
  eventer["Eventer<br/>FastAPI, :8005<br/>Просмотры и клики"]
  gorse["Gorse<br/>Gorse, :8088<br/>Рекомендации вошедшему покупателю"]
  meili[("Meilisearch<br/>Meilisearch, :7700<br/>Поисковый индекс")]
  pg[("Postgres<br/>PostgreSQL, :5432<br/>Пользователи, корзина, заказы и витринные копии")]
  redis[("Redis<br/>Redis, :6379<br/>Состояние eventer")]
  kafka[["Kafka<br/>Kafka, :9094<br/>Копии каталога и ленты из B2B"]]
  b2bgoods["B2B Goods<br/>FastAPI, :8081<br/>Источник товара при синхронизации"]
  b2bpubs["B2B Publications<br/>FastAPI, :8082<br/>Источник публикации при синхронизации"]
  processor["Order processor<br/>FastAPI, :8095<br/>Ссылка на оплату заказа"]
  yandex["Яндекс ID<br/>Вход"]
  maps["Яндекс Карты<br/>ПВЗ на чекауте"]
  cdek["СДЭК<br/>Цена и заявка"]

  buyer -->|Открывает| web
  web -->|HTTPS| b2capi
  b2capi -->|Кто вошёл и чей магазин| users
  b2capi -->|Карточки и рекомендации без входа| goods
  b2capi -->|Лента и поиск постов| pubs
  b2capi -->|Поиск товаров| search
  b2capi -->|Корзина| cart
  b2capi -->|Оформление и заказы| orders
  b2capi -->|Подборка вошедшему| gorse
  b2capi -->|Вход| yandex
  b2capi -->|Пункты выдачи| maps
  web -->|События поведения| eventer
  search -->|Запрос| meili
  users --> pg
  cart --> pg
  orders --> pg
  goods --> pg
  pubs --> pg
  eventer --> redis
  eventer -->|Просмотр, корзина и покупка| gorse
  kafka -->|product.*| goods
  kafka -->|publication.*| pubs
  goods -->|Дочитывает карточку товара| b2bgoods
  pubs -->|Дочитывает публикацию| b2bpubs
  orders -->|Платёж заказа| processor
  orders -->|Доставка| cdek
```

## B2B

```mermaid
flowchart TB
  seller["Продавец<br/>Профиль, товары, доставка и публикации"]
  moderator["Модератор<br/>Принимает или отклоняет с причиной"]
  web["Витрина<br/>Next.js, :3000<br/>Кабинет продавца и страницы модерации"]
  b2bapi["B2B API<br/>FastAPI, :8090<br/>Фасад кабинета и модерации"]
  users["Users<br/>FastAPI, :8001<br/>Проверка сессии продавца"]
  b2bgoods["B2B Goods<br/>FastAPI, :8081<br/>Товары, остаток и модерация карточек"]
  b2bpubs["B2B Publications<br/>FastAPI, :8082<br/>Посты и их модерация"]
  orders["Orders<br/>FastAPI, :8004<br/>Заказы этого продавца"]
  processor["Order processor<br/>FastAPI, :8095<br/>Premium и подключение магазина ЮKassa"]
  b2bpg[("B2B Postgres<br/>PostgreSQL<br/>Магазин, подписка, товары и посты")]
  minio[("MinIO<br/>S3, :9000<br/>Файлы фото, а не ссылки")]
  kafka[["Kafka<br/>Kafka, :9094<br/>События после принятия модерации"]]
  goods["Goods<br/>FastAPI, :8006<br/>Витрина получает события товаров"]
  pubs["Publications<br/>FastAPI, :8002<br/>Лента получает события публикаций"]
  yookassa["ЮKassa<br/>Тестовый магазин Premium и OAuth"]

  seller -->|Правит магазин| web
  moderator -->|Решает заявки| web
  web -->|HTTPS и cookie| b2bapi
  b2bapi -->|Кто делает запрос| users
  b2bapi -->|Товары и модерация товаров| b2bgoods
  b2bapi -->|Посты и модерация постов| b2bpubs
  b2bapi -->|Список и смена статуса| orders
  b2bapi -->|Оплата Premium и shop id| processor
  b2bapi -->|Аватар, фото и обложка| minio
  b2bapi -->|Магазин, заявка и подписка| b2bpg
  b2bgoods -->|Карточки| b2bpg
  b2bpubs -->|Публикации| b2bpg
  b2bgoods -->|События товара после принятия| kafka
  b2bpubs -->|События публикации после принятия| kafka
  kafka -->|Обновляет витрину| goods
  kafka -->|Обновляет ленту| pubs
  processor -->|Платёж и account id| yookassa
```

## Обработка заказов

```mermaid
flowchart TB
  buyer["Покупатель<br/>Платит заказ"]
  seller["Продавец<br/>Ведёт заказ и Premium"]
  web["Витрина<br/>Next.js, :3000<br/>Чекаут, оплата и кабинет заказа"]
  b2capi["B2C API<br/>FastAPI, :8080<br/>Собирает чекаут"]
  orders["Orders<br/>FastAPI, :8004<br/>Заказ и статус"]
  goods["Goods<br/>FastAPI, :8006<br/>Проверка и списание витринного остатка"]
  b2bapi["B2B API<br/>FastAPI, :8090<br/>Premium и статус заказа в кабинете"]
  b2bgoods["B2B Goods<br/>FastAPI, :8081<br/>Остаток товара продавца"]
  processor["Order processor<br/>FastAPI, :8095<br/>Заказы на заглушке, Premium в тестовой ЮKassa"]
  scheduler["Scheduler<br/>FastAPI, :8096<br/>Каждые 15 секунд регистрирует и исполняет продление"]
  pg[("Postgres<br/>PostgreSQL, :5432<br/>Заказы, платежи и задачи планировщика")]
  b2bpg[("B2B Postgres<br/>PostgreSQL<br/>Подписка, способ оплаты и задача продления")]
  cdek["СДЭК<br/>Заявка после оплаты и отмена заявки"]
  yookassa["ЮKassa<br/>Платёж Premium и сохранённый способ оплаты"]

  buyer -->|Оформляет| web
  seller -->|Меняет статус и Premium| web
  web -->|Чекаут покупателя| b2capi
  web -->|Статус и подписка продавца| b2bapi
  b2capi -->|Уменьшает витринный остаток| goods
  b2capi -->|Уменьшает остаток каталога| b2bgoods
  b2capi -->|Создаёт заказ| orders
  orders -->|Заказ и история статусов| pg
  orders -->|Ссылка на оплату| processor
  orders -->|Заявка и отмена| cdek
  processor -->|Платёж| pg
  processor -->|Только Premium и привязка магазина| yookassa
  b2bapi -->|Чекаут Premium и повторное списание| processor
  b2bapi -->|Срок Premium и флаг автопродления| b2bpg
  b2bapi -->|Статус в кабинете продавца| orders
  scheduler -->|Незарегистрированные задачи, затем begin и finish| b2bapi
  scheduler -->|Списание по сохранённому способу оплаты| processor
  scheduler -->|Задача с тем же UUID| pg
```
