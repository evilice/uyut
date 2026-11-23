<?php
declare(strict_types=1);

// Обработчик заявок для REG.RU. Для работы нужен Linux-хостинг с PHP 8.0+.
// Перед публикацией откройте mail-settings.php и укажите адрес с ВАШЕГО домена.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function answer(int $code, bool $success, string $message): never {
    http_response_code($code);
    echo json_encode(['success' => $success, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    answer(405, false, 'Используйте форму на сайте.');
}

// Avoid cross-origin submissions from other websites. Browsers on the same site are allowed.
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== '') {
    $originHost = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    $siteHost = explode(':', (string)($_SERVER['HTTP_HOST'] ?? ''))[0];
    if (!is_string($originHost) || strcasecmp($originHost, $siteHost) !== 0) {
        answer(403, false, 'Недопустимый источник заявки.');
    }
}

if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) {
    answer(413, false, 'Слишком большой запрос.');
}

$contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
if (str_contains($contentType, 'application/json')) {
    $data = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) answer(400, false, 'Некорректные данные формы.');
} elseif (str_contains($contentType, 'application/x-www-form-urlencoded') || str_contains($contentType, 'multipart/form-data')) {
    $data = $_POST;
} else {
    answer(415, false, 'Формат запроса не поддерживается.');
}

function field(array $data, string $name, int $max = 1500): string {
    $value = $data[$name] ?? '';
    if (!is_string($value) && !is_numeric($value)) return '';
    $value = trim((string)$value);
    // Strip control characters, avoid email header injection, keep natural text.
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    if (function_exists('mb_substr')) return mb_substr($value, 0, $max, 'UTF-8');
    if (preg_match_all('/./us', $value, $chars) !== false) return implode('', array_slice($chars[0], 0, $max));
    return '';
}

if (field($data, '_honey') !== '') {
    // Honeypot field: bots should not receive detailed feedback.
    answer(200, true, 'Заявка принята.');
}
if (field($data, 'personalDataConsent') !== 'Да') {
    answer(422, false, 'Необходимо согласие на обработку персональных данных.');
}

$types = [
    'booking' => 'Запись на мастер-класс/курс',
    'event' => 'Заявка на мероприятие',
    'certificate' => 'Заявка на подарочный сертификат',
];
$type = field($data, 'formType', 50);
if (!isset($types[$type])) answer(422, false, 'Выберите тип заявки.');

$fields = [
    'Мастер-класс или курс' => ['Мастер-класс'],
    'Имя' => ['name', 'eventName', 'certName'],
    'Телефон' => ['phone', 'eventPhone', 'certPhone'],
    'E-mail' => ['email', 'eventEmail', 'certEmail'],
    'Способ связи' => ['contact'],
    'Количество участников' => ['people'],
    'Желаемые дата и время' => ['date'],
    'Комментарий' => ['comment', 'eventComment'],
    'Формат мероприятия' => ['format'],
    'Количество гостей' => ['guests'],
    'Желаемая дата' => ['eventDate'],
    'Место проведения' => ['place'],
    'Сумма сертификата' => ['sum'],
];

$modeFields = [
    // В форме e-mail, дата и число участников необязательны (CNT-08); сервер проверяет только имя и телефон.
    'booking' => ['name', 'phone'],
    'event' => ['eventName', 'eventPhone'],
    'certificate' => ['certName', 'certPhone'],
];
foreach ($modeFields[$type] as $required) {
    if (field($data, $required) === '') answer(422, false, 'Заполните обязательные поля формы.');
}
$phoneField = ['booking'=>'phone','event'=>'eventPhone','certificate'=>'certPhone'][$type];
$digits = preg_replace('/\D/u', '', field($data, $phoneField));
if (strlen($digits ?? '') < 10 || strlen($digits ?? '') > 15) {
    answer(422, false, 'Укажите корректный номер телефона.');
}
$replyField = ['booking'=>'email','event'=>'eventEmail','certificate'=>'certEmail'][$type];
$reply = field($data, $replyField, 254);
if ($reply !== '' && filter_var($reply, FILTER_VALIDATE_EMAIL) === false) {
    answer(422, false, 'Укажите корректный адрес электронной почты.');
}
if ($type === 'booking' && field($data, 'Мастер-класс') === '') {
    answer(422, false, 'Не выбран мастер-класс.');
}

$config = require __DIR__ . '/mail-settings.php';
$to = trim((string)($config['recipient'] ?? ''));
$from = trim((string)($config['sender'] ?? ''));
if (!filter_var($to, FILTER_VALIDATE_EMAIL) ||
    !filter_var($from, FILTER_VALIDATE_EMAIL) ||
    str_contains($from, 'ВАШ-ДОМЕН') || str_contains($from, 'example.')) {
    answer(503, false, 'Отправка заявок пока не настроена. Пожалуйста, позвоните в мастерскую.');
}

$lines = [];
foreach ($fields as $label => $keys) {
    foreach ($keys as $key) {
        $value = field($data, $key);
        if ($value !== '') {
            $lines[] = $label . ': ' . str_replace(["\r", "\n"], ' ', $value);
            break;
        }
    }
}
$body = "Новая заявка с сайта «УЮТ»\nТип: {$types[$type]}\n\n" . implode("\n", $lines) .
        "\n\nСогласие на обработку персональных данных: получено.\n";
$subject = 'УЮТ: ' . $types[$type];
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedName = '=?UTF-8?B?' . base64_encode('УЮТ — заявки с сайта') . '?=';
$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'From: ' . $encodedName . ' <' . $from . '>',
    'X-Mailer: uyut-contact-form',
];
if ($reply !== '') $headers[] = 'Reply-To: ' . $reply;

// PHP mail() is supported on REG.RU Linux hosting with PHP, if outgoing mail is enabled.
// The sender must be an existing mailbox on your domain; mail() returning true
// means handed to local mailer, NOT guaranteed delivered to inbox.
$sent = @mail($to, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $from);
if (!$sent) {
    error_log('UYUT contact form: mail() failed');
    answer(503, false, 'Не удалось отправить заявку. Позвоните нам или повторите попытку позже.');
}
answer(200, true, 'Заявка передана почтовой системе.');
