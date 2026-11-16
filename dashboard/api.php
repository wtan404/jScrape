<?php
/**
 * dashboard/api.php
 * High-performance Server-Side Persistence API for jScrape PM Command Center
 * Synchronizes application tracking state, triage drops, and candidate profile across all devices.
 */

// Headers for JSON response & Security
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// Paths to persistent data files
$rootDir = dirname(__DIR__);
$appsFile = $rootDir . '/job_applications.json';
$profileFile = $rootDir . '/profile.json';
$jobsDataFile = $rootDir . '/jobs_data.json';
$resumesMetaFile = $rootDir . '/uploads/resumes/metadata.json';

// Helper: Read JSON safely
function readJsonFile($path, $default = []) {
    if (!file_exists($path)) {
        return $default;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || empty(trim($raw))) {
        return $default;
    }
    $parsed = @json_decode($raw, true);
    return is_array($parsed) ? $parsed : $default;
}

// Helper: Write JSON atomically with file locking
function writeJsonFile($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $payload = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    return @file_put_contents($path, $payload, LOCK_EX) !== false;
}

// Helper: Ensure standard applications structure
function sanitizeApplicationsStructure($apps) {
    if (!is_array($apps)) {
        return ['applied' => [], 'dismissed' => []];
    }
    $result = [
        'applied' => isset($apps['applied']) && is_array($apps['applied']) ? $apps['applied'] : [],
        'dismissed' => isset($apps['dismissed']) && is_array($apps['dismissed']) ? $apps['dismissed'] : []
    ];
    // Also detect if $apps is a legacy flat dictionary
    foreach ($apps as $k => $v) {
        if ($k === 'applied' || $k === 'dismissed') continue;
        if (is_array($v) && isset($v['status'])) {
            $st = strtolower($v['status']);
            if ($st === 'dismissed' || $st === 'drop') {
                $result['dismissed'][$k] = $v;
            } else {
                $result['applied'][$k] = $v;
            }
        }
    }
    return $result;
}

// Parse Request
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

// Read incoming JSON body if POST/PUT
$rawInput = file_get_contents('php://input');
$body = [];
if (!empty($rawInput)) {
    $parsed = @json_decode($rawInput, true);
    if (is_array($parsed)) {
        $body = $parsed;
    }
}

// --------------------------------------------------------------------------
// Route: Action Dispatcher
// --------------------------------------------------------------------------

switch ($action) {

    // 1. Full Applications State (Load on page startup or Full Sync)
    case 'applications':
        $apps = sanitizeApplicationsStructure(readJsonFile($appsFile, ['applied' => [], 'dismissed' => []]));
        
        if ($method === 'POST') {
            // Full sync / merge from client
            if (isset($body['applied']) && is_array($body['applied'])) {
                foreach ($body['applied'] as $k => $v) {
                    $apps['applied'][$k] = $v;
                }
            }
            if (isset($body['dismissed']) && is_array($body['dismissed'])) {
                foreach ($body['dismissed'] as $k => $v) {
                    $apps['dismissed'][$k] = $v;
                }
            }
            writeJsonFile($appsFile, $apps);
            echo json_encode([
                'status' => 'success',
                'message' => 'Applications state synchronized.',
                'appliedCount' => count($apps['applied']),
                'dismissedCount' => count($apps['dismissed']),
                'applications' => $apps
            ]);
            exit;
        }

        echo json_encode($apps);
        exit;

    // 2. Single Application Status Update (Mark Applied, Drop, Restore, Status Dropdown)
    case 'application-status':
        if ($method !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method Not Allowed']);
            exit;
        }

        $apps = sanitizeApplicationsStructure(readJsonFile($appsFile, ['applied' => [], 'dismissed' => []]));

        $jobId = $body['jobId'] ?? '';
        $job = $body['job'] ?? [];
        $op = $body['action'] ?? ($body['status'] ?? 'applied');
        $now = gmdate('Y-m-d\TH:i:s\Z');

        if (empty($jobId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing jobId']);
            exit;
        }

        // Action: Mark as Applied
        if ($op === 'applied') {
            unset($apps['dismissed'][$jobId]);
            $apps['applied'][$jobId] = [
                'jobId' => $jobId,
                'job' => $job,
                'status' => $body['status'] ?? 'Applied',
                'resumeId' => $body['resumeId'] ?? null,
                'resumeLabel' => $body['resumeLabel'] ?? 'Default Resume',
                'notes' => $body['notes'] ?? 'Application recorded via Command Center',
                'appliedAt' => $body['appliedAt'] ?? $now,
                'updatedAt' => $now
            ];
        }
        // Action: Drop / Dismiss
        elseif ($op === 'dismiss' || $op === 'drop') {
            unset($apps['applied'][$jobId]);
            $apps['dismissed'][$jobId] = [
                'jobId' => $jobId,
                'job' => $job,
                'reason' => $body['reason'] ?? 'Marked as irrelevant by PM',
                'dismissedAt' => $body['dismissedAt'] ?? $now,
                'updatedAt' => $now
            ];
        }
        // Action: Restore back to Active Queue
        elseif ($op === 'restore' || $op === 're-activate') {
            unset($apps['applied'][$jobId]);
            unset($apps['dismissed'][$jobId]);
        }
        // Action: Update status in tracking dropdown (e.g. Interviewing, Offer, Rejected)
        elseif ($op === 'update_status') {
            if (isset($apps['applied'][$jobId])) {
                $apps['applied'][$jobId]['status'] = $body['status'] ?? $apps['applied'][$jobId]['status'];
                $apps['applied'][$jobId]['updatedAt'] = $now;
                if (!empty($body['notes'])) {
                    $apps['applied'][$jobId]['notes'] = $body['notes'];
                }
            }
        }
        // Action: Remove from tracking entirely
        elseif ($op === 'remove_tracking') {
            unset($apps['applied'][$jobId]);
        }

        writeJsonFile($appsFile, $apps);

        echo json_encode([
            'status' => 'success',
            'action' => $op,
            'jobId' => $jobId,
            'appliedCount' => count($apps['applied']),
            'dismissedCount' => count($apps['dismissed'])
        ]);
        exit;

    // 3. Batch Actions (Batch Mark Applied & Batch Drop)
    case 'application-batch-status':
        if ($method !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method Not Allowed']);
            exit;
        }

        $apps = sanitizeApplicationsStructure(readJsonFile($appsFile, ['applied' => [], 'dismissed' => []]));
        $jobs = $body['jobs'] ?? [];
        $op = $body['action'] ?? 'mark_applied';
        $now = gmdate('Y-m-d\TH:i:s\Z');

        if (!is_array($jobs) || empty($jobs)) {
            http_response_code(400);
            echo json_encode(['error' => 'Empty or invalid jobs array']);
            exit;
        }

        $updatedCount = 0;
        foreach ($jobs as $item) {
            $key = $item['jobId'] ?? ($item['id'] ?? ($item['url'] ?? ''));
            if (empty($key)) continue;

            $jobData = $item['job'] ?? $item;

            if ($op === 'mark_applied') {
                unset($apps['dismissed'][$key]);
                $apps['applied'][$key] = [
                    'jobId' => $key,
                    'job' => $jobData,
                    'status' => $body['status'] ?? 'Applied',
                    'resumeId' => $item['resumeId'] ?? ($body['resumeId'] ?? null),
                    'resumeLabel' => $item['resumeLabel'] ?? ($body['resumeLabel'] ?? 'Default Resume'),
                    'notes' => 'Batch application recorded via Command Center',
                    'appliedAt' => $now,
                    'updatedAt' => $now
                ];
                $updatedCount++;
            } elseif ($op === 'dismiss' || $op === 'drop') {
                unset($apps['applied'][$key]);
                $apps['dismissed'][$key] = [
                    'jobId' => $key,
                    'job' => $jobData,
                    'reason' => $body['reason'] ?? 'Dropped during batch triage',
                    'dismissedAt' => $now,
                    'updatedAt' => $now
                ];
                $updatedCount++;
            }
        }

        writeJsonFile($appsFile, $apps);

        echo json_encode([
            'status' => 'success',
            'action' => $op,
            'updatedCount' => $updatedCount,
            'appliedCount' => count($apps['applied']),
            'dismissedCount' => count($apps['dismissed'])
        ]);
        exit;

    // 4. Candidate Profile Persistence
    case 'profile':
        if ($method === 'POST') {
            writeJsonFile($profileFile, $body);
            echo json_encode(['status' => 'success', 'profile' => $body]);
            exit;
        }
        $profile = readJsonFile($profileFile, null);
        echo json_encode($profile ?: new stdClass());
        exit;

    // 5. Dashboard Summary (High-Speed Single Network Roundtrip)
    case 'summary':
        $apps = sanitizeApplicationsStructure(readJsonFile($appsFile, ['applied' => [], 'dismissed' => []]));
        $profile = readJsonFile($profileFile, null);
        $resumes = readJsonFile($resumesMetaFile, []);

        // Calculate 72-hour postings count
        $count72h = 0;
        $totalVerified = 0;
        if (file_exists($jobsDataFile)) {
            $jd = readJsonFile($jobsDataFile, ['jobs' => []]);
            $rawJobs = $jd['jobs'] ?? [];
            $totalVerified = count($rawJobs);
            $cutoff = time() - (72 * 3600);
            foreach ($rawJobs as $j) {
                if (!empty($j['date'])) {
                    $ts = strtotime($j['date']);
                    if ($ts !== false && $ts >= $cutoff) {
                        $count72h++;
                    }
                }
            }
        }

        echo json_encode([
            'profile' => $profile,
            'resumesCount' => count($resumes),
            'resumes' => $resumes,
            'jobsCount24h' => $count72h,
            'totalVerified' => $totalVerified,
            'submissionsCount' => count($apps['applied']),
            'applications' => $apps
        ]);
        exit;

    default:
        // Echo health status if called directly
        echo json_encode([
            'status' => 'healthy',
            'service' => 'jscrape-persistence-api',
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'actions' => ['applications', 'application-status', 'application-batch-status', 'profile', 'summary']
        ]);
        exit;
}
