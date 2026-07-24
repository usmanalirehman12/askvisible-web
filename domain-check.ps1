$ErrorActionPreference = "Stop"

$rawNames = @'
AICite
AIFound
AIMentionly
AIPosition
AIReco
AISeen
AISOV
AnswerFlow AI
AnswerGain
AnswerLens AI
AnswerMap
AnswerPresence
AnswerPulse
AnswerRank
AnswerScope AI
AnswerShare
AnswerShortlist
AnswerSignal
AnswerVis
AnswerVanta
AskAura
AskBeam
AskCite
AskEcho
AskEdge
AskFind
AskFix AI
AskGain
AskGrowth AI
AskGuide
AskInsight
AskLens
AskLift
AskList
AskMark
AskMetric AI
AskPath
AskPeak
AskPick
AskPulse
AskRadar
AskRank
AskReach
AskRise
AskScope
AskShare
AskSignal
AskSOV
AskTrack AI
AskVanta
AskView
AskVis
AskVisible
AskVista AI
AskVox
AskVue
AskWin
AskWise
Aurea AI
AureliQ AI
Aurevia AI
Avento AI
Avera AI
Avora AI
BrandCite
BrandInAI
BrandLLM
BrandSeen
BrandShortlist
BrightPath AI
BrightView AI
CiteAura
CiteBeam
CiteEdge
CiteFlow
CiteGain
CiteGrid
CiteIQ
CiteLead
CiteLens
CiteLift
CiteLoom
CiteLoop
CiteMap
CiteMeter
CiteMint
CiteOS
CitePath
CitePeak
CitePilot
CitePulse
CiteRadar
CiteRank
CiteRise
CiteScope
CiteScore
CiteSee
CiteShare
CiteSpot
CiteSpy
CiteUp
CiteV
CiteVanta
CiteVa
CiteVis
CiteVo
CiteVue
CiteWatch
CiteWin
CiteWise
Citey
CiteZa
CiteZo
CitedAI
CitedByAI
Citemetria
Citera
Citiva
Citly
Cito
Citoo
Citora
ClariCore AI
ClariFlow AI
ClariGrow
ClariRank AI
ClarityIQ
ClaritySite AI
ClariSight AI
ClariVanta AI
ClariVista AI
Clarivo AI
Clario AI
ClearLens AI
ClearPath AI
ClearScope AI
ClearSignal AI
ClearView AI
ClearVista AI
DigitalLens AI
DigitalSignal AI
DigitalTrack AI
DigitalVantage AI
DigitalVista AI
DiscoverFlow AI
DiscoverIQ AI
DiscoverLens AI
Elara AI
ElevateIQ
Elevora AI
FindableAI
FullScope AI
FullView AI
GetCited
GetSeenAI
GrowLens AI
GrowSight AI
GrowVista AI
GrowVia AI
GrowthCheck AI
GrowthGuide AI
GrowthIQ AI
GrowthLens AI
GrowthMap AI
GrowthPath AI
GrowthPulse AI
GrowthRadar AI
GrowthScope AI
GrowthSignal AI
GrowthTrack AI
GrowthVanta AI
GrowthView AI
GrowthVista AI
GrowthWatch AI
InsightMap AI
InsightUp AI
Intellivista AI
InTheAnswer
LLMRank
LLMRanker
LLMRadar
LLMSeen
LLMScope
LLMVis
LLMWatch
Luma AI
Lumetriq AI
Lumora AI
Mentionly
Nexa AI
Nexora AI
Nexora IQ
OmniVista AI
OneScope AI
OneView AI
OneVista AI
OptiCore AI
OptiFlow AI
OptiMetria
OptiRise AI
OptiScope AI
OptiSignal AI
OptiSight AI
OptiVanta AI
OptiVara AI
OptiVis AI
OptiVista AI
OptiVue AI
Optelis AI
Oria AI
PresenceIQ
PresencePulse AI
Presora AI
PrimeScope AI
PromptBeacon
PromptVanta
PromptVis
QueryScope AI
QuerySignal AI
RankAsk
RankLens AI
RankVista
Recometra
RecoAI
SearchCheck AI
SearchFix AI
SearchGuide AI
SearchLens AI
SearchMap AI
SearchPath AI
SearchPulse AI
SearchRadar AI
SearchScope AI
SearchSignal AI
SearchTrack AI
SearchVanta
SearchView AI
SearchVista AI
SeenAI
SightFix AI
SightFlow AI
SightLift AI
Sightly AI
Sightora AI
SightUp AI
SightIQ
SignalIQ
Signalift AI
SignalOne AI
SignalRise AI
SignalVanta
SignalVista AI
SignalVue AI
Signalyn AI
Signalora AI
SiteAIQ
SiteAura AI
SiteBeacon AI
SiteBloom AI
SiteBoost AI
SiteBrain AI
SiteBright AI
SiteCheck AI
SiteClarity AI
SiteFlow IQ
SiteFlux AI
SiteGlow AI
SiteGrade AI
SiteGrow AI
SiteGrowth AI
SiteGuide AI
SiteHalo AI
SiteHealth AI
SiteInsight AI
SiteIntel AI
SiteIntelix
SiteIQ
SiteLens AI
SiteLift
SiteMetria
SiteMind AI
SiteOps AI
SiteOptAI
SiteOrbit
SitePath AI
SitePilot
SitePrism AI
SitePulse
SiteRadar
SiteRise AI
SiteSavvy
SiteScan AI
SiteScout AI
SiteSense AI
SiteSignal AI
SiteSmart AI
SiteSpark AI
SiteVanta
SiteVista AI
SiteVision AI
SiteVibe AI
SiteWise
SiteZen AI
SmartAudit AI
SmartPath AI
SmartSignal AI
SmartView AI
Scopeora AI
Sona AI
TotalScope AI
TotalView AI
TrafficLens AI
TrueScope AI
TrueView AI
Valenta AI
Valentis AI
Valora AI
VantageCore AI
VantageFlow AI
VantageIQ
VantageSignal AI
Velora AI
Vela AI
Vero AI
Vetra AI
Veya AI
Viora AI
Visara AI
Visarq AI
Visaro AI
Visentra AI
VisiCore AI
VisiFix AI
VisiGrow AI
VisiLens AI
VisiPilot AI
VisiPulse AI
VisiTrack AI
VisiVanta AI
Visibly AI
Visiblyt AI
Visflow AI
VisGrow AI
VisiLift AI
Vislyt AI
Visora AI
Vistraq AI
Vista AI
VistaCore AI
VistaEdge AI
VistaFlow AI
VistaGrow AI
VistaIQ
VistaOne AI
VistaPilot AI
VistaPrime AI
VistaPulse AI
Vistara AI
Vistara IQ
Vistella AI
Vistiq AI
Vistaro AI
VistGrow AI
VistZen AI
Vizora AI
WebAIQ
WebAudit AI
WebBeacon
WebBloom AI
WebBoost AI
WebBrain AI
WebCheck
WebClarity AI
WebFix AI
WebFlow IQ
WebGlo AI
WebGlow AI
WebGrade AI
WebGrow AI
WebGuide AI
WebHalo AI
WebHealth AI
WebInsight AI
WebIQ AI
WebLens AI
WebLift AI
WebLyt
WebMetria
WebMind AI
WebOpt AI
WebOpti
WebOrbit AI
WebPath AI
WebPilot
WebPrism AI
WebPulse AI
WebRadar AI
WebRise AI
WebSavvy
WebScan AI
WebScope AI
WebScout AI
WebSense
WebSight AI
WebSignal AI
WebVista AI
WebVanta
WebVision AI
WebWise AI
WebZen AI
'@

$names = $rawNames -split "\r?\n" |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    Sort-Object -Unique

function Get-DomainLabel([string]$name) {
    return ($name.ToLowerInvariant() -replace "[^a-z0-9]", "")
}

function Get-RdapStatus([string]$domain, [string]$tld) {
    if ($tld -eq "com") {
        $url = "https://rdap.verisign.com/com/v1/domain/$($domain.ToUpperInvariant())"
    } else {
        $url = "https://rdap.identitydigital.services/rdap/domain/$domain"
    }

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $code = & curl.exe -sS --retry 2 --retry-all-errors -o NUL -w "%{http_code}" $url 2>$null
    $ErrorActionPreference = $previousPreference
    switch ($code) {
        "200" { return "Registered" }
        "404" { return "No registration found" }
        default { return "Unconfirmed ($code)" }
    }
}

$rows = foreach ($name in $names) {
    $label = Get-DomainLabel $name
    $com = "$label.com"
    $ai = "$label.ai"
    $io = "$label.io"

    [pscustomobject]@{
        Name = $name
        ComDomain = $com
        ComStatus = Get-RdapStatus $com "com"
        AiDomain = $ai
        AiStatus = Get-RdapStatus $ai "ai"
        IoDomain = $io
        IoStatus = Get-RdapStatus $io "io"
    }
}

$available = $rows | Where-Object {
    $_.ComStatus -eq "No registration found" -or
    $_.AiStatus -eq "No registration found" -or
    $_.IoStatus -eq "No registration found"
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Product name domain availability")
$lines.Add("")
$lines.Add("Checked directly against the authoritative RDAP registries on $(Get-Date -Format 'yyyy-MM-dd HH:mm K').")
$lines.Add("")
$lines.Add("> **No registration found** means the registry returned RDAP 404 at check time. It is not a purchase guarantee: registrar restrictions, premium pricing, reserved names, and simultaneous registrations can still apply.")
$lines.Add("")
$lines.Add("## Names with at least one potentially available domain")
$lines.Add("")
$lines.Add("| Name | .com | .ai | .io |")
$lines.Add("|---|---|---|---|")
foreach ($row in $available) {
    $lines.Add("| $($row.Name) | $($row.ComDomain): **$($row.ComStatus)** | $($row.AiDomain): **$($row.AiStatus)** | $($row.IoDomain): **$($row.IoStatus)** |")
}
$lines.Add("")
$lines.Add("## Complete results")
$lines.Add("")
$lines.Add("| Name | .com | .ai | .io |")
$lines.Add("|---|---|---|---|")
foreach ($row in $rows) {
    $lines.Add("| $($row.Name) | $($row.ComDomain): **$($row.ComStatus)** | $($row.AiDomain): **$($row.AiStatus)** | $($row.IoDomain): **$($row.IoStatus)** |")
}

$lines | Set-Content -LiteralPath (Join-Path $PSScriptRoot "DOMAIN-AVAILABILITY.md") -Encoding utf8

$summary = [pscustomobject]@{
    NamesChecked = $rows.Count
    DomainsChecked = $rows.Count * 3
    ComAvailable = ($rows | Where-Object ComStatus -eq "No registration found").Count
    AiAvailable = ($rows | Where-Object AiStatus -eq "No registration found").Count
    IoAvailable = ($rows | Where-Object IoStatus -eq "No registration found").Count
    AnyAvailable = $available.Count
}
$summary | Format-List
