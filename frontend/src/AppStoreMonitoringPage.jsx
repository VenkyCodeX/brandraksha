import { useEffect, useState } from 'react'

async function requestApi(path, options = {}) {
	const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
	let response
	try {
		response = await fetch(`${apiBaseUrl}${path}`, {
			...options,
			headers: { 'Content-Type': 'application/json', ...options.headers },
		})
	} catch {
		throw new Error('The backend could not be reached. Check that the backend server is running.')
	}
	const payload = await response.json().catch(() => null)
	if (!response.ok) throw new Error(payload?.error?.message || `Request failed with status ${response.status}.`)
	if (payload?.status !== 'success' || !payload.data) throw new Error('The backend returned an unexpected response.')
	return payload.data
}

function formatScanDate(value) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

const PLATFORMS = [
	{ id: 'apple', label: 'Apple App Store', scanPath: 'app-store-scans', buttonLabel: 'Search App Store', scanningLabel: 'Searching Apple App Store…', sourceLabel: 'Apple Search API · on demand' },
	{ id: 'google', label: 'Google Play', scanPath: 'google-play-scans', buttonLabel: 'Simulate Google Play Scan', scanningLabel: 'Simulating Google Play scan…', sourceLabel: 'Google Play · Simulated data' },
]

function AppStoreMonitoringPage({ onNavigate }) {
	const [activePlatform, setActivePlatform] = useState('apple')
	const [brands, setBrands] = useState([])
	const [selectedBrandId, setSelectedBrandId] = useState('')
	const [countryCode, setCountryCode] = useState('US')
	const [scanHistory, setScanHistory] = useState([])
	const [selectedScanId, setSelectedScanId] = useState('')
	const [currentScan, setCurrentScan] = useState(null)
	const [isLoadingBrands, setIsLoadingBrands] = useState(true)
	const [isLoadingHistory, setIsLoadingHistory] = useState(false)
	const [isScanning, setIsScanning] = useState(false)
	const [error, setError] = useState('')
	const [historyError, setHistoryError] = useState('')
	const [message, setMessage] = useState('')
	const [countryError, setCountryError] = useState('')

	const platform = PLATFORMS.find((p) => p.id === activePlatform)

	useEffect(() => {
		const controller = new AbortController()
		async function loadBrands() {
			setIsLoadingBrands(true)
			try {
				const data = await requestApi('/api/brands', { signal: controller.signal })
				if (!Array.isArray(data.brands)) throw new Error('The backend returned an invalid brand list.')
				setBrands(data.brands)
				if (data.brands.length) setSelectedBrandId(String(data.brands[0]._id))
				setError('')
			} catch (loadError) {
				if (!controller.signal.aborted) setError(`Could not load saved brand profiles: ${loadError.message}`)
			} finally {
				if (!controller.signal.aborted) setIsLoadingBrands(false)
			}
		}
		loadBrands()
		return () => controller.abort()
	}, [])

	useEffect(() => {
		if (!selectedBrandId) return undefined
		const controller = new AbortController()
		async function loadHistory() {
			setIsLoadingHistory(true)
			setHistoryError('')
			setScanHistory([])
			setSelectedScanId('')
			setCurrentScan(null)
			try {
				const data = await requestApi(`/api/brands/${encodeURIComponent(selectedBrandId)}/${platform.scanPath}`, { signal: controller.signal })
				if (!Array.isArray(data.scans)) throw new Error('The backend returned invalid scan history.')
				setScanHistory(data.scans)
				setSelectedScanId(data.scans[0]?._id || '')
				setCurrentScan(data.scans[0] || null)
			} catch (loadError) {
				if (!controller.signal.aborted) setHistoryError(loadError.message || 'Scan history could not be loaded.')
			} finally {
				if (!controller.signal.aborted) setIsLoadingHistory(false)
			}
		}
		loadHistory()
		return () => controller.abort()
	}, [selectedBrandId, activePlatform]) // eslint-disable-line react-hooks/exhaustive-deps

	function selectHistory(scanId) {
		setSelectedScanId(scanId)
		setCurrentScan(scanHistory.find((scan) => scan._id === scanId) || null)
	}

	function handleBrandChange(event) {
		setSelectedBrandId(event.target.value)
		setScanHistory([])
		setSelectedScanId('')
		setCurrentScan(null)
		setMessage('')
		setHistoryError('')
	}

	function handlePlatformChange(platformId) {
		setActivePlatform(platformId)
		setScanHistory([])
		setSelectedScanId('')
		setCurrentScan(null)
		setMessage('')
		setError('')
		setHistoryError('')
	}

	async function handleScan(event) {
		event.preventDefault()
		setError('')
		setMessage('')
		setCountryError('')
		const normalizedCountry = countryCode.trim().toUpperCase()
		if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
			setCountryError('Enter a two-letter country code, such as US or IN.')
			return
		}
		if (!selectedBrandId) {
			setError('Select a saved brand profile before scanning.')
			return
		}
		setIsScanning(true)
		try {
			const data = await requestApi(`/api/brands/${encodeURIComponent(selectedBrandId)}/${platform.scanPath}`, {
				method: 'POST',
				body: JSON.stringify({ countryCode: normalizedCountry }),
			})
			if (!data.scan || !Array.isArray(data.scan.findings)) throw new Error('The backend returned an invalid scan result.')
			setScanHistory((current) => [data.scan, ...current.filter((scan) => scan._id !== data.scan._id)])
			setSelectedScanId(data.scan._id)
			setCurrentScan(data.scan)
			setMessage('Scan completed and saved.')
		} catch (scanError) {
			setError(`Scan failed: ${scanError.message}`)
		} finally {
			setIsScanning(false)
		}
	}

	return (
		<div className="app-store-page">
			<div className="app-store-intro">
				<div>
					<p className="eyebrow">App monitoring</p>
					<h1>Mobile App Analysis</h1>
					<p>Search app store listings against a saved brand profile. Every candidate is a review lead, not a fraud determination.</p>
				</div>
			</div>

			<div className="platform-tabs" role="tablist" aria-label="App store platform">
				{PLATFORMS.map((p) => (
					<button
						key={p.id}
						type="button"
						role="tab"
						aria-selected={activePlatform === p.id}
						className={`platform-tab ${activePlatform === p.id ? 'active' : ''}`}
						onClick={() => handlePlatformChange(p.id)}
					>
						{p.label}
						{p.id === 'google' && <span className="sim-badge">Simulated</span>}
					</button>
				))}
			</div>

			{activePlatform === 'google' && (
				<div className="sim-notice" role="note">
					<strong>Simulated data.</strong> Google Play does not provide a public search API. This tab demonstrates the monitoring workflow using deterministic fixtures generated from your brand profile. Results are not real Play Store listings.
				</div>
			)}

			{error && <div className="profile-message profile-error" role="alert">{error}</div>}
			{message && <div className="profile-message profile-success" role="status">{message}</div>}

			<form className="panel app-store-controls" onSubmit={handleScan}>
				<label className="field">
					<span>Saved brand profile</span>
					<select value={selectedBrandId} onChange={handleBrandChange} disabled={isLoadingBrands || brands.length === 0}>
						<option value="">{isLoadingBrands ? 'Loading brands…' : 'Select a brand profile'}</option>
						{brands.map((brand) => <option key={brand._id} value={brand._id}>{brand.brandName}</option>)}
					</select>
				</label>
				<label className="field country-code-field">
					<span>Country code</span>
					<input value={countryCode} onChange={(event) => setCountryCode(event.target.value)} maxLength={2} placeholder="US" aria-invalid={Boolean(countryError)} />
					{countryError && <small role="alert">{countryError}</small>}
				</label>
				<button className="primary-button" type="submit" disabled={isScanning || isLoadingBrands || !selectedBrandId}>
					{isScanning ? platform.scanningLabel : platform.buttonLabel}
				</button>
				{!isLoadingBrands && brands.length === 0 && !error && (
					<p className="app-store-empty-brands">No saved brands yet. <button type="button" className="inline-action" onClick={() => onNavigate('brand-profile')}>Create a brand profile</button> to run a search.</p>
				)}
			</form>

			{historyError && <div className="profile-message profile-error" role="alert">Could not load prior scans: {historyError}</div>}
			{isLoadingHistory && <div className="profile-message profile-loading" role="status">Loading saved scan history…</div>}

			{scanHistory.length > 0 && (
				<div className="panel app-scan-history">
					<label className="field" htmlFor="app-scan-history-select">
						<span>Saved scan history</span>
						<select id="app-scan-history-select" value={selectedScanId} onChange={(event) => selectHistory(event.target.value)}>
							{scanHistory.map((scan) => (
								<option key={scan._id} value={scan._id}>
									{formatScanDate(scan.scannedAt)} · {scan.findings?.length || 0} review leads
								</option>
							))}
						</select>
					</label>
				</div>
			)}

			{currentScan && (
				<section className="app-scan-results" aria-live="polite">
					<div className="panel app-scan-summary">
						<div className="app-scan-summary-heading">
							<div><p className="eyebrow">{currentScan.source}</p><h2>Scan results</h2></div>
							<span>{formatScanDate(currentScan.scannedAt)}</span>
						</div>
						<div className="app-scan-metrics">
							<div><strong>{currentScan.scannedAppCount}</strong><span>Listings reviewed</span></div>
							<div><strong>{currentScan.findings?.length || 0}</strong><span>Review leads</span></div>
							<div><strong>{currentScan.officialMatchCount}</strong><span>Registered apps excluded</span></div>
							<div><strong>{currentScan.countryCode}</strong><span>Storefront</span></div>
						</div>
						{currentScan.findings?.length > 0 && (
							<div className="findings-summary">
								{['CRITICAL','HIGH','MEDIUM','LOW'].map((level) => {
									const count = currentScan.findings.filter((f) => f.riskLevel === level).length
									return count > 0 ? (
										<span key={level} className={`risk-pill ${level.toLowerCase()}`}>{count} {level}</span>
									) : null
								})}
							</div>
						)}
						<p className="app-scan-exclusion-note">Registered official apps were excluded using bundle IDs, store listing IDs, or an exact app-name and publisher match. Names alone are not treated as proof of authenticity.</p>
					</div>

					{currentScan.findings?.length ? (
						<div className="app-finding-list">
							{currentScan.findings.map((finding) => (
								<article className="panel app-finding" key={finding._id || finding.trackId}>
									{finding.iconUrl && <img className="app-finding-icon" src={finding.iconUrl} alt={`${finding.appName} icon`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}
									<div className="app-finding-content">
										<div className="app-finding-heading">
											<div><p className="eyebrow">Manual review lead · {finding.status}</p><h3>{finding.appName}</h3></div>
											<span className={`risk-pill ${finding.riskLevel.toLowerCase()}`}>{finding.riskLevel} · {finding.score}</span>
										</div>
										<dl className="app-finding-details">
											<div><dt>Publisher</dt><dd>{finding.publisher || finding.sellerName || 'Not listed'}</dd></div>
											<div><dt>Bundle / Package ID</dt><dd>{finding.bundleId || 'Not listed'}</dd></div>
											<div><dt>Name similarity</dt><dd>{finding.nameSimilarity}% to {finding.matchedReferenceName || 'brand reference'}</dd></div>
											{finding.logoSimilarity != null && (
												<div><dt>Logo similarity</dt><dd className={finding.logoSimilarity >= 70 ? 'logo-sim-high' : ''}>{finding.logoSimilarity}% visual match to brand logo</dd></div>
											)}
										</dl>
										<ul className="app-finding-reasons">{finding.reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
										{finding.description && <details className="app-description"><summary>Listing description</summary><p>{finding.description}</p></details>}
										{finding.storeUrl && <a className="app-store-link" href={finding.storeUrl} target="_blank" rel="noreferrer">Open listing</a>}
									</div>
								</article>
							))}
						</div>
					) : (
						<div className="profile-empty-state app-no-findings">No candidates met the configured review threshold in this result set. This does not prove that no impersonating apps exist.</div>
					)}
				</section>
			)}
		</div>
	)
}

export default AppStoreMonitoringPage
