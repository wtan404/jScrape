<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$file = __DIR__ . '/profiles_store.json';

// Ensure file exists
if (!file_exists($file)) {
    $defaultData = [
        'activeProfileId' => 'profile1',
        'profiles' => [
            'profile1' => [
                'id' => 'profile1',
                'name' => 'User 1 - IT Management, WebOps & DevOps',
                'hasPin' => false,
                'pin' => null,
                'targetTitles' => ['Manager of IT', 'IT Manager', 'Web Operations', 'WebOps Manager', 'Website Development', 'DevOps Manager', 'DevOps Lead', 'Director of IT', 'Web Engineering Manager'],
                'keywords' => ['devops', 'webops', 'web development', 'infrastructure', 'cloud', 'terraform', 'kubernetes', 'change control', 'it management'],
                'lastScraped' => date('c')
            ],
            'profile2' => [
                'id' => 'profile2',
                'name' => 'User Profile 2 (Custom)',
                'hasPin' => false,
                'pin' => null,
                'targetTitles' => [],
                'keywords' => [],
                'lastScraped' => null
            ],
            'profile3' => [
                'id' => 'profile3',
                'name' => 'User Profile 3 (Custom)',
                'hasPin' => false,
                'pin' => null,
                'targetTitles' => [],
                'keywords' => [],
                'lastScraped' => null
            ]
        ]
    ];
    file_put_contents($file, json_encode($defaultData, JSON_PRETTY_PRINT));
}

$raw = file_get_contents($file);
$store = json_decode($raw, true) ?: ['profiles' => [], 'activeProfileId' => 'profile1'];

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. PIN VERIFICATION ENDPOINT
if ($action === 'verify-pin' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $profileId = isset($input['profileId']) ? $input['profileId'] : '';
    $pin = isset($input['pin']) ? $input['pin'] : '';

    if (isset($store['profiles'][$profileId])) {
        $prof = $store['profiles'][$profileId];
        if (empty($prof['pin'])) {
            $store['profiles'][$profileId]['pin'] = $pin;
            $store['profiles'][$profileId]['hasPin'] = true;
            file_put_contents($file, json_encode($store, JSON_PRETTY_PRINT));
            echo json_encode(['success' => true, 'message' => 'PIN established']);
            exit();
        } else if ($prof['pin'] === $pin) {
            echo json_encode(['success' => true]);
            exit();
        }
    }
    echo json_encode(['success' => false, 'error' => 'Invalid PIN']);
    exit();
}

// 2. SAVE PROFILE DETAILS ENDPOINT
if (($action === 'save' || $_SERVER['REQUEST_METHOD'] === 'POST') && $action !== 'verify-pin') {
    $input = json_decode(file_get_contents('php://input'), true);
    if ($input && isset($input['profileId'])) {
        $id = $input['profileId'];
        if (!isset($store['profiles'][$id])) {
            $store['profiles'][$id] = ['id' => $id];
        }

        if (isset($input['name'])) $store['profiles'][$id]['name'] = trim($input['name']);
        if (isset($input['targetTitles'])) $store['profiles'][$id]['targetTitles'] = $input['targetTitles'];
        if (isset($input['keywords'])) $store['profiles'][$id]['keywords'] = $input['keywords'];
        if (isset($input['pin']) && $input['pin']) {
            $store['profiles'][$id]['pin'] = $input['pin'];
            $store['profiles'][$id]['hasPin'] = true;
        }

        file_put_contents($file, json_encode($store, JSON_PRETTY_PRINT));
        echo json_encode(['success' => true, 'profiles' => $store['profiles']]);
        exit();
    }
}

// 3. GET ALL PROFILES ENDPOINT
echo json_encode($store);
