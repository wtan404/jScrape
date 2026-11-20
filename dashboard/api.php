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
                if (isset($body['rejectionStage'])) {
                    $apps['applied'][$jobId]['rejectionStage'] = $body['rejectionStage'];
                }
                if (!empty($body['stageHistory'])) {
                    $apps['applied'][$jobId]['stageHistory'] = $body['stageHistory'];
                }
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

    // 5. URL Metadata Scanner (Drop Posting URL to Scan & Track)
    case 'parse-job-url':
        $targetUrl = '';
        if ($method === 'POST') {
            $targetUrl = trim($body['url'] ?? ($_POST['url'] ?? ''));
        } else {
            $targetUrl = trim($_GET['url'] ?? '');
        }

        if (empty($targetUrl) || !filter_var($targetUrl, FILTER_VALIDATE_URL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Please provide a valid job posting URL.']);
            exit;
        }

        $detectedTitle = '';
        $detectedCompany = '';
        $detectedLocation = 'Remote';
        $detectedWorkType = 'Remote';
        $detectedSalary = null;
        $detectedSource = 'Direct Manual Import';
        $detectedDate = gmdate('Y-m-d\TH:i:s\Z');
        $rawJdText = '';

        // 1. Check for Greenhouse Board API
        if (preg_match('#boards\.greenhouse\.io/([^/]+)/jobs/([0-9]+)#i', $targetUrl, $ghMatches)) {
            $ghCompany = $ghMatches[1];
            $ghJobId = $ghMatches[2];
            $ghApiUrl = "https://boards-api.greenhouse.io/v1/boards/{$ghCompany}/jobs/{$ghJobId}";

            $ch = curl_init($ghApiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);
            $ghRes = curl_exec($ch);
            $ghCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($ghCode === 200 && !empty($ghRes)) {
                $ghData = @json_decode($ghRes, true);
                if (is_array($ghData)) {
                    $detectedTitle = $ghData['title'] ?? '';
                    $detectedCompany = ucfirst($ghCompany);
                    $detectedLocation = isset($ghData['location']['name']) ? $ghData['location']['name'] : 'Remote';
                    $detectedSource = "Greenhouse (" . strtoupper($ghCompany) . ")";
                    $content = $ghData['content'] ?? '';
                    $rawJdText = $content;
                    if (preg_match('/\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*(?:-|to)\s*\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i', $content, $salMatch)) {
                        $detectedSalary = $salMatch[0];
                    }
                }
            }
        }

        // 2. Check for Lever Postings API
        if (empty($detectedTitle) && preg_match('#jobs\.lever\.co/([^/]+)/([a-f0-9-]+)#i', $targetUrl, $levMatches)) {
            $levCompany = $levMatches[1];
            $levJobId = $levMatches[2];
            $levApiUrl = "https://api.lever.co/v0/postings/{$levCompany}/{$levJobId}";

            $ch = curl_init($levApiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);
            $levRes = curl_exec($ch);
            $levCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($levCode === 200 && !empty($levRes)) {
                $levData = @json_decode($levRes, true);
                if (is_array($levData)) {
                    $detectedTitle = $levData['text'] ?? '';
                    $detectedCompany = ucfirst($levCompany);
                    $detectedLocation = isset($levData['categories']['location']) ? $levData['categories']['location'] : 'Remote';
                    $detectedSource = "Lever (" . strtoupper($levCompany) . ")";
                    $rawJdText = ($levData['descriptionPlain'] ?? '') . ' ' . ($levData['additionalPlain'] ?? '');
                }
            }
        }

        // 3. Workday Candidate Experience (CXS) REST API
        if (empty($detectedTitle) && preg_match('#([a-zA-Z0-9_-]+)\.(?:wd\d+\.)?myworkdayjobs\.com#i', $targetUrl, $wdMatches)) {
            $wdTenant = $wdMatches[1];
            $parsedHost = parse_url($targetUrl, PHP_URL_HOST);
            $parsedPath = parse_url($targetUrl, PHP_URL_PATH);

            if (preg_match('~(?:[a-z]{2}(?:-[a-z]{2})?/)?([^/]+)/job/(?:.*?/)?([^/?#]+)~i', $parsedPath, $pm)) {
                $site = $pm[1];
                $jobSlug = $pm[2];
                $apiUrl = "https://{$parsedHost}/wday/cxs/{$wdTenant}/{$site}/job/{$jobSlug}";

                $ch = curl_init($apiUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 7);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept: application/json, text/plain, */*'
                ]);
                $wdRes = curl_exec($ch);
                $wdCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($wdCode === 200 && !empty($wdRes)) {
                    $wdData = @json_decode($wdRes, true);
                    if (is_array($wdData) && isset($wdData['jobPostingInfo'])) {
                        $info = $wdData['jobPostingInfo'];
                        $detectedTitle = trim($info['title'] ?? '');
                        $detectedLocation = trim($info['location'] ?? 'Remote');
                        $rawJdText = $info['jobDescription'] ?? '';
                        if (!empty($info['startDate'])) $detectedDate = $info['startDate'];
                        if (preg_match('/\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)\s*(?:-|to)\s*\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)/i', $rawJdText, $salMatch)) {
                            $detectedSalary = $salMatch[0];
                        }
                    }
                }
            }
            if (empty($detectedCompany)) {
                $detectedCompany = ucfirst($wdTenant);
            }
            $detectedSource = "Workday ({$detectedCompany})";
        }

        // 4. Ashby Board & Job Resolver (Embedded Next.js & REST)
        if (empty($detectedTitle) && preg_match('~jobs\.ashbyhq\.com/([^/?#]+)(?:/([a-zA-Z0-9_-]+))?~i', $targetUrl, $ashMatches)) {
            $companySlug = $ashMatches[1];

            $ch = curl_init($targetUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 7);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            ]);
            $ashRes = curl_exec($ch);
            curl_close($ch);

            if (!empty($ashRes)) {
                $rawJdText = $ashRes;
                if (preg_match('#<script[^>]+id=[\'"]__NEXT_DATA__[\'"][^>]*>([\s\S]*?)</script>#i', $ashRes, $ndMatch)) {
                    $nextData = @json_decode($ndMatch[1], true);
                    if (is_array($nextData) && isset($nextData['props']['pageProps']['jobPosting'])) {
                        $jp = $nextData['props']['pageProps']['jobPosting'];
                        if (!empty($jp['title'])) $detectedTitle = trim($jp['title']);
                        if (!empty($jp['companyName'])) $detectedCompany = trim($jp['companyName']);
                        if (!empty($jp['locationName'])) $detectedLocation = trim($jp['locationName']);
                        if (!empty($jp['descriptionHtml'])) $rawJdText = $jp['descriptionHtml'];
                        if (!empty($jp['compensation']['scrapeCompensationSummary'])) {
                            $detectedSalary = $jp['compensation']['scrapeCompensationSummary'];
                        }
                    }
                }
            }
            if (empty($detectedCompany)) {
                $detectedCompany = ucfirst($companySlug);
            }
            $detectedSource = "Ashby ({$detectedCompany})";
        }

        // 5. SmartRecruiters Postings API
        if (empty($detectedTitle) && preg_match('~(?:jobs|careers)\.smartrecruiters\.com/([^/?#]+)/([a-zA-Z0-9_-]+)~i', $targetUrl, $srMatches)) {
            $srCompany = $srMatches[1];
            $srJobSlug = $srMatches[2];
            $parts = explode('-', $srJobSlug);
            $srJobId = $parts[0];

            $apiUrl = "https://api.smartrecruiters.com/v1/companies/{$srCompany}/postings/{$srJobId}";
            $ch = curl_init($apiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);
            $srRes = curl_exec($ch);
            $srCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($srCode === 200 && !empty($srRes)) {
                $srData = @json_decode($srRes, true);
                if (is_array($srData)) {
                    $detectedTitle = trim($srData['name'] ?? '');
                    $detectedCompany = trim($srData['company']['name'] ?? ucfirst($srCompany));
                    if (!empty($srData['location'])) {
                        $loc = $srData['location'];
                        $locParts = array_filter([$loc['city'] ?? '', $loc['region'] ?? '', $loc['country'] ?? '']);
                        $detectedLocation = !empty($locParts) ? implode(', ', $locParts) : (!empty($loc['remote']) ? 'Remote' : 'Remote');
                    }
                    $detectedSource = "SmartRecruiters ({$detectedCompany})";
                    if (!empty($srData['jobAd']['sections']['jobDescription']['text'])) {
                        $rawJdText = $srData['jobAd']['sections']['jobDescription']['text'];
                        if (preg_match('/\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)\s*(?:-|to)\s*\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)/i', $rawJdText, $salMatch)) {
                            $detectedSalary = $salMatch[0];
                        }
                    }
                }
            }
            if (empty($detectedCompany)) {
                $detectedCompany = ucfirst($srCompany);
            }
            $detectedSource = "SmartRecruiters ({$detectedCompany})";
        }

        // 6. BambooHR Postings
        if (empty($detectedTitle) && preg_match('#([a-zA-Z0-9_-]+)\.bamboohr\.com/(?:careers|jobs)#i', $targetUrl, $bhrMatches)) {
            $bhrTenant = $bhrMatches[1];
            $detectedCompany = ucfirst($bhrTenant);
            $detectedSource = "BambooHR ({$detectedCompany})";
        }

        // 7. Oracle Cloud Recruiting (ORC / Candidate Experience CX) & Taleo
        $isOracleCloud = (bool)preg_match('/oraclecloud\.com|careers\.oracle\.com/i', $targetUrl);
        $isTaleo = (bool)preg_match('/taleo\.net/i', $targetUrl);

        if (empty($detectedTitle) && $isOracleCloud) {
            $parsedHost = parse_url($targetUrl, PHP_URL_HOST);
            $parsedPath = parse_url($targetUrl, PHP_URL_PATH);

            $tenantName = 'Oracle';
            if (preg_match('/^([a-zA-Z0-9_-]+)\.fa\.(?:[a-zA-Z0-9_-]+\.)?oraclecloud\.com/i', $parsedHost, $tm)) {
                $tenantName = $tm[1];
            } elseif (preg_match('/^([a-zA-Z0-9_-]+)\.oraclecloud\.com/i', $parsedHost, $tm)) {
                $tenantName = $tm[1];
            }

            $formattedEmployer = strtoupper($tenantName);
            if (preg_match('/^eeho$/i', $tenantName) || preg_match('/careers\.oracle\.com/i', $parsedHost)) {
                $formattedEmployer = 'Oracle';
            } elseif (preg_match('/^jpmc$/i', $tenantName)) {
                $formattedEmployer = 'JPMorgan Chase';
            } elseif (strlen($tenantName) > 4) {
                $formattedEmployer = ucfirst(strtolower($tenantName));
            }

            $siteNumber = 'CX';
            $jobId = null;
            if (preg_match('#sites/([^/]+)/(?:job|requisitions/preview)/([0-9a-zA-Z_-]+)#i', $parsedPath, $sm)) {
                $siteNumber = $sm[1];
                $jobId = $sm[2];
            } elseif (preg_match('#job/([0-9a-zA-Z_-]+)#i', $parsedPath, $sm)) {
                $jobId = $sm[1];
            }

            if ($jobId) {
                $orcApiUrl = "https://{$parsedHost}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?onlyData=true&expand=all&finder=ById;Id=%22{$jobId}%22,siteNumber={$siteNumber}";
                $ch = curl_init($orcApiUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 7);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                ]);
                $orcRes = curl_exec($ch);
                $orcCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($orcCode === 200 && !empty($orcRes)) {
                    $orcData = @json_decode($orcRes, true);
                    if (is_array($orcData) && !empty($orcData['items'][0])) {
                        $it = $orcData['items'][0];
                        $detectedTitle = trim($it['Title'] ?? '');
                        $detectedLocation = $it['PrimaryLocation'] ?? 'Remote';
                        $rawJdText = ($it['ExternalDescriptionStr'] ?? '') . ' ' . ($it['ShortDescriptionStr'] ?? '');

                        if (preg_match('/^jpmc$/i', $tenantName)) {
                            $detectedCompany = 'JPMorgan Chase';
                        } else {
                            $corpComp = trim($it['LegalEmployer'] ?? ($it['Organization'] ?? ($it['BusinessUnit'] ?? '')));
                            if (!empty($corpComp) && !preg_match('/^(oraclecloud|company)$/i', $corpComp)) {
                                $detectedCompany = $corpComp;
                            } else {
                                $detectedCompany = $formattedEmployer;
                            }
                        }
                        $detectedSource = "Oracle Cloud ({$detectedCompany})";
                        if (!empty($it['ExternalPostedStartDate'])) {
                            $detectedDate = $it['ExternalPostedStartDate'];
                        }
                        if (preg_match('/\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)\s*(?:-|to)\s*\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)/i', $rawJdText, $salMatch)) {
                            $detectedSalary = $salMatch[0];
                        }
                    }
                }
            }
        }

        if (empty($detectedTitle) && $isTaleo) {
            $parsedHost = parse_url($targetUrl, PHP_URL_HOST);
            $parts = explode('.', $parsedHost);
            $tOrg = $parts[0] ?? '';
            if ($tOrg === 'chm' || $tOrg === 'tbe') {
                parse_str(parse_url($targetUrl, PHP_URL_QUERY) ?? '', $queryParams);
                if (!empty($queryParams['org'])) $tOrg = $queryParams['org'];
            }
            if (!empty($tOrg) && !preg_match('/^(taleo|www|chm|tbe)$/i', $tOrg)) {
                $detectedCompany = ucfirst($tOrg);
            } else {
                $detectedCompany = 'Employer';
            }
            $detectedSource = "Taleo ({$detectedCompany})";
        }

        // 4. LinkedIn URL Recognition, Guest API & Slug Parsing
        $isLinkedIn = (bool)preg_match('#linkedin\.com#i', $targetUrl);
        if ($isLinkedIn) {
            $detectedSource = 'LinkedIn';
            $linkedInJobId = null;
            if (preg_match('#/jobs/view/(?:[^\/]+-)?(\d{6,})#i', $targetUrl, $idM)) {
                $linkedInJobId = $idM[1];
            } elseif (preg_match('#[?&]currentJobId=(\d{6,})#i', $targetUrl, $idM)) {
                $linkedInJobId = $idM[1];
            } elseif (preg_match('#/jobs/view/(\d+)#i', $targetUrl, $idM)) {
                $linkedInJobId = $idM[1];
            }

            // B. Query LinkedIn Guest API (Bypasses 429 guest view wall)
            if ($linkedInJobId) {
                $guestApiUrl = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{$linkedInJobId}";
                $ch = curl_init($guestApiUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 6);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language: en-US,en;q=0.9'
                ]);
                $gHtml = curl_exec($ch);
                $gCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($gCode === 200 && !empty($gHtml)) {
                    $rawJdText = $gHtml;
                    if (preg_match('#<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)</h2>#i', $gHtml, $tm) ||
                        preg_match('#<h1[^>]*class="[^"]*topcard__title[^"]*"[^>]*>([\s\S]*?)</h1>#i', $gHtml, $tm) ||
                        preg_match('#<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)</h1>#i', $gHtml, $tm)) {
                        $detectedTitle = trim(html_entity_decode(strip_tags($tm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    }

                    if (preg_match('#<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)</a>#i', $gHtml, $cm) ||
                        preg_match('#<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>([\s\S]*?)</span>#i', $gHtml, $cm) ||
                        preg_match('#class="[^"]*top-card-layout__first-subline[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)</a>#i', $gHtml, $cm)) {
                        $parsedComp = trim(html_entity_decode(strip_tags($cm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                        if (!empty($parsedComp) && !preg_match('/^(linkedin|company)$/i', $parsedComp)) {
                            $detectedCompany = $parsedComp;
                        }
                    }

                    if (preg_match('#<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)</span>#i', $gHtml, $lm) ||
                        preg_match('#<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)</span>#i', $gHtml, $lm)) {
                        $detectedLocation = trim(html_entity_decode(strip_tags($lm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    }

                    if (preg_match('/\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)\s*(?:-|to)\s*\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)/i', $gHtml, $salMatch)) {
                        $detectedSalary = $salMatch[0];
                    }
                }
            }

            // Slug fallback
            if (empty($detectedTitle) || empty($detectedCompany)) {
                $path = parse_url($targetUrl, PHP_URL_PATH);
                if ($path && preg_match('#/jobs/view/([a-z0-9-]+)#i', $path, $slugMatch)) {
                    $slug = preg_replace('/-[0-9]{6,}$/', '', $slugMatch[1]);
                    if (strpos($slug, '-at-') !== false) {
                        list($roleSlug, $companySlug) = explode('-at-', $slug, 2);
                        if (!empty($roleSlug) && empty($detectedTitle)) {
                            $detectedTitle = ucwords(str_replace('-', ' ', $roleSlug));
                        }
                        if (!empty($companySlug) && empty($detectedCompany)) {
                            $detectedCompany = ucwords(str_replace('-', ' ', $companySlug));
                        }
                    }
                }
            }
        }

        // 8. Universal Semantic HTML Engine (JSON-LD / OpenGraph / Twitter Cards / Semantic H1)
        if (empty($detectedTitle) || empty($detectedCompany)) {
            $ch = curl_init($targetUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9'
            ]);
            $html = curl_exec($ch);
            curl_close($ch);

            if (!empty($html)) {
                $rawJdText = $html;
                // A. Parse JSON-LD JobPosting schema
                if (preg_match_all('#<script[^>]+type=[\'"]application/ld\+json[\'"][^>]*>([\s\S]*?)</script>#i', $html, $scriptMatches)) {
                    foreach ($scriptMatches[1] as $jsonStr) {
                        $json = @json_decode(trim($jsonStr), true);
                        if (is_array($json)) {
                            $items = isset($json['@graph']) && is_array($json['@graph']) ? $json['@graph'] : [$json];
                            foreach ($items as $item) {
                                if (isset($item['@type']) && (strtolower($item['@type']) === 'jobposting' || strtolower($item['@type']) === 'job')) {
                                    if (!empty($item['title']) && empty($detectedTitle)) $detectedTitle = trim($item['title']);
                                    if (!empty($item['hiringOrganization']['name']) && empty($detectedCompany)) {
                                        $org = trim($item['hiringOrganization']['name']);
                                        if (!preg_match('/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|greenhouse|lever|workday|ashby|smartrecruiters)$/i', $org)) {
                                            $detectedCompany = $org;
                                        }
                                    }
                                    if (!empty($item['jobLocation']['address'])) {
                                        $addr = $item['jobLocation']['address'];
                                        $locParts = array_filter([$addr['addressLocality'] ?? '', $addr['addressRegion'] ?? '', $addr['addressCountry'] ?? '']);
                                        if (!empty($locParts)) $detectedLocation = implode(', ', $locParts);
                                    } elseif (!empty($item['jobLocationType']) && strtolower($item['jobLocationType']) === 'telecommute') {
                                        $detectedLocation = 'Remote';
                                    }
                                    if (!empty($item['datePosted'])) $detectedDate = $item['datePosted'];

                                    if (!empty($item['baseSalary']['value'])) {
                                        $v = $item['baseSalary']['value'];
                                        if (!empty($v['minValue']) && !empty($v['maxValue'])) {
                                            $detectedSalary = '$' . number_format((float)$v['minValue']) . ' - $' . number_format((float)$v['maxValue']);
                                        } elseif (!empty($v['value'])) {
                                            $detectedSalary = '$' . number_format((float)$v['value']);
                                        }
                                    } elseif (!empty($item['baseSalary']) && is_string($item['baseSalary'])) {
                                        $detectedSalary = $item['baseSalary'];
                                    }
                                    break 2;
                                }
                            }
                        }
                    }
                }

                // B. Parse OpenGraph & Twitter Cards
                if (empty($detectedTitle) && preg_match('#<meta[^>]+(?:property|name)=[\'"](?:og:title|twitter:title)[\'"][^>]+content=[\'"](.*?)[\'"]#i', $html, $ogMatch)) {
                    $detectedTitle = trim(html_entity_decode($ogMatch[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                }
                if (empty($detectedCompany) && preg_match('#<meta[^>]+(?:property|name)=[\'"](?:og:site_name|twitter:site)[\'"][^>]+content=[\'"](.*?)[\'"]#i', $html, $siteMatch)) {
                    $cand = trim(html_entity_decode($siteMatch[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    $cand = ltrim($cand, '@');
                    if (!preg_match('/^(@?)(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|greenhouse|lever|workday|ashby|smartrecruiters|twitter|company|direct employer)$/i', $cand)) {
                        $detectedCompany = $cand;
                    }
                }

                // C. Parse Semantic H1
                if (empty($detectedTitle) && preg_match('#<h1[^>]*>([\s\S]*?)</h1>#i', $html, $h1Match)) {
                    $h1Text = trim(html_entity_decode(strip_tags($h1Match[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    if (!empty($h1Text) && strlen($h1Text) < 120 && !preg_match('/^(sign in|login|welcome|careers|jobs)$/i', $h1Text)) {
                        $detectedTitle = $h1Text;
                    }
                }

                // D. Parse HTML <title> fallback
                if (empty($detectedTitle) && preg_match('#<title[^>]*>(.*?)</title>#i', $html, $titleMatch)) {
                    $cleanTitle = trim(html_entity_decode(strip_tags($titleMatch[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    $detectedTitle = $cleanTitle;
                }

                // E. Extract Salary via regex
                if (empty($detectedSalary) && preg_match('/\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)\s*(?:-|to)\s*\$([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?k?)/i', $html, $salMatch)) {
                    $detectedSalary = $salMatch[0];
                }
            }
        }

        // Deconstruct compound titles:
        // e.g. "<Role> at <Company> - <Location> | LinkedIn"
        // e.g. "<Company> hiring <Role>" or "<Company> Careers: <Role>"
        if (!empty($detectedTitle)) {
            $detectedTitle = preg_replace('/\s*[-|–—•·]\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|Built In|Workday|Greenhouse|Lever|Ashby|SmartRecruiters|Jobs|Careers).*$/i', '', $detectedTitle);
            $isPlaceholder = (bool)preg_match('/^(?:opportunity|role)(?:\s+at\s+.*)?$/i', $detectedTitle);

            if (!$isPlaceholder) {
                $atMatch = preg_match('/^(.+?)\s+(?:at|@)\s+([^-–—|•·]+?)(?:\s*[-–—|•·]\s*(.+))?$/i', $detectedTitle, $atMatches);
                $hiringMatch = preg_match('/^([^-–—|•·]+?)\s+(?:is\s+)?hiring\s+(?:a\s+|an\s+)?(.+)/i', $detectedTitle, $hireMatches);
                $careersMatch = preg_match('/^([^-–—|•·]+?)\s+(?:careers|jobs)\s*[:|–—-]\s*(.+)/i', $detectedTitle, $carMatches);

                if ($atMatch && strtolower(trim($atMatches[1])) !== 'opportunity' && strtolower(trim($atMatches[1])) !== 'role') {
                    $detectedTitle = trim($atMatches[1]);
                    $extractedComp = trim($atMatches[2]);
                    if (empty($detectedCompany) || preg_match('/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i', trim($detectedCompany))) {
                        if (!preg_match('/^(company|opportunity|role)$/i', $extractedComp)) {
                            $detectedCompany = $extractedComp;
                        }
                    }
                    if ((empty($detectedLocation) || $detectedLocation === 'Remote') && !empty($atMatches[3])) {
                        $detectedLocation = trim($atMatches[3]);
                    }
                } elseif ($hiringMatch) {
                    $detectedTitle = trim($hireMatches[2]);
                    $extractedComp = trim($hireMatches[1]);
                    if (empty($detectedCompany) || preg_match('/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i', trim($detectedCompany))) {
                        $detectedCompany = $extractedComp;
                    }
                } elseif ($careersMatch) {
                    $detectedTitle = trim($carMatches[2]);
                    $extractedComp = trim($carMatches[1]);
                    if (empty($detectedCompany) || preg_match('/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i', trim($detectedCompany))) {
                        $detectedCompany = $extractedComp;
                    }
                }
            }
        }

        // Hostname fallback with subdomain stripping
        if (empty($detectedCompany) || preg_match('/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i', trim($detectedCompany))) {
            $host = parse_url($targetUrl, PHP_URL_HOST);
            $cleanHost = preg_replace('/^www\./i', '', $host ?: '');
            $hostParts = explode('.', $cleanHost);
            $filtered = array_values(array_filter($hostParts, function($p) {
                return !preg_match('/^(careers|jobs|boards|work|apply|hire|corp|cdn)$/i', $p);
            }));
            $cand = count($filtered) >= 2 ? $filtered[count($filtered) - 2] : ($filtered[0] ?? ($cleanHost ?: 'Company'));
            if (!preg_match('/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|myworkdayjobs|bamboohr|ashbyhq|smartrecruiters)$/i', $cand)) {
                $detectedCompany = ucfirst($cand);
            } else {
                $detectedCompany = $isOracleCloud ? 'Oracle' : ($isTaleo ? 'Employer' : ($isLinkedIn ? 'Direct Employer' : 'Company'));
            }
        }

        if (empty($detectedTitle) || preg_match('/^opportunity(?:\s+at\s+.*)?$/i', trim($detectedTitle))) {
            $detectedTitle = (!empty($detectedCompany) && !preg_match('/^(company|direct employer)$/i', $detectedCompany))
                ? 'Role at ' . $detectedCompany
                : 'Tracked Position';
        }

        // Work type classification
        $combinedText = strtolower($detectedTitle . ' ' . $detectedLocation . ' ' . $rawJdText);
        if (strpos($combinedText, 'hybrid') !== false) {
            $detectedWorkType = 'Hybrid';
        } elseif (strpos($combinedText, 'remote') !== false || strpos($combinedText, 'telecommute') !== false || strpos($combinedText, 'work from home') !== false) {
            $detectedWorkType = 'Remote';
        } else {
            $detectedWorkType = 'Remote';
        }

        // Check for specific group of states restriction
        $isLimitedStateGroup = false;
        if ($detectedWorkType === 'Remote' || $detectedWorkType === 'Hybrid') {
            if (
                preg_match('/(?:eligible|participating|specific|select|selected|approved|certain|limited)\s+(?:us\s+)?states/i', $combinedText) ||
                preg_match('/(?:remote|telecommute|wfh)[\s\S]{0,100}(?:only\s+in|restricted\s+to|limited\s+to|eligible\s+states|following\s+states|selected\s+states|certain\s+states|specific\s+states)/i', $combinedText) ||
                preg_match('/(?:must\s+(?:reside|live|be\s+located)|open\s+to\s+(?:residents\s+of|candidates\s+in)|hiring\s+(?:only\s+)?in)[\s\S]{0,120}(?:following\s+states|these\s+states|selected\s+states|select\s+states|\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s*,\s*[A-Z]{2})+\b)/i', $combinedText) ||
                preg_match('/(?:remote|hybrid)\s*[-–—:]\s*(?:[A-Za-z\s]+,\s*){1,10}[A-Za-z\s]+/i', $detectedLocation) ||
                preg_match('/(?:remote|hybrid)\s*\((?:[A-Z]{2}[,\s\/]+){1,15}[A-Z]{2}\)/i', $detectedLocation) ||
                preg_match('/\((?:[A-Z]{2}[,\s\/]+){1,15}[A-Z]{2}\)\s*(?:remote|hybrid)/i', $detectedLocation) ||
                preg_match('/(?:,\s*us-[a-z\s]+){2,}/i', $detectedLocation)
            ) {
                $isLimitedStateGroup = true;
            }
        }

        if ($isLimitedStateGroup) {
            $detectedLocation = 'limited, US';
        }

        $jobId = 'manual-' . substr(md5($targetUrl), 0, 10);
        $scannedJob = [
            'id' => $jobId,
            'source' => $detectedSource,
            'title' => trim($detectedTitle),
            'company' => trim($detectedCompany),
            'location' => trim($detectedLocation),
            'workType' => $detectedWorkType,
            'salary' => $detectedSalary,
            'url' => $targetUrl,
            'matchedKeyword' => 'MANUAL IMPORT',
            'date' => $detectedDate
        ];

        echo json_encode([
            'status' => 'success',
            'job' => $scannedJob
        ]);
        exit;

    // 6. Dashboard Summary (High-Speed Single Network Roundtrip)
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
            'actions' => ['applications', 'application-status', 'application-batch-status', 'profile', 'summary', 'parse-job-url']
        ]);
        exit;
}
