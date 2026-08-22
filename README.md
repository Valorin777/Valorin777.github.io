# Сайт «Окошка»

Статические страницы для GitHub Pages: главная, приглашение по ссылке,
политика конфиденциальности и удаление аккаунта.

## Куда это публиковать

Репозиторий должен называться **valorin777.github.io** — тогда сайт открывается
по адресу `https://valorin777.github.io/`, а файлы проверки ссылок лежат в корне
домена. Проектный репозиторий (вида `github.com/charygin/okoshko`) не подойдёт:
Android и iOS ищут `/.well-known/` строго в корне.

```bash
git init
git add -A
git commit -m "Сайт «Окошка»"
git branch -M main
git remote add origin git@github.com:Valorin777/valorin777.github.io.git
git push -u origin main
```

Затем в настройках репозитория: Settings → Pages → Source: `Deploy from a branch`,
ветка `main`, папка `/ (root)`. Через минуту страницы поднимутся.

## Что где лежит

| Файл | Зачем |
| --- | --- |
| `index.html` | главная: что за приложение, ссылки на документы |
| `404.html` | ссылка-приглашение `/m/481523` — на Pages нет такой страницы, её разбирает 404-я |
| `m/index.html` | то же для адреса `/m/?code=481523` |
| `privacy.html` | политика конфиденциальности, её адрес указан в приложении |
| `delete-account.html` | как удалить аккаунт — требование обоих магазинов |
| `.well-known/assetlinks.json` | Android проверяет по нему, что ссылки принадлежат приложению |
| `.well-known/apple-app-site-association` | то же для iOS |

## Если поменяется ключ подписи Android

В `assetlinks.json` записан отпечаток релизного ключа. Новый берётся так:

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs app-release.apk
```

Строка `SHA-256 digest` переводится в формат `AA:BB:CC:…` (верхний регистр,
байты через двоеточие) и заменяет старую.

## Universal links на iOS

Чтобы ссылка открывала приложение без промежуточной страницы, в `app.json`
нужен `ios.associatedDomains: ["applinks:valorin777.github.io"]`. Это требует
платного аккаунта Apple Developer — до него ссылка открывается в браузере,
а страница сама предлагает перейти в приложение.
