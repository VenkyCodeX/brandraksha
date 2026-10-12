import { useEffect, useState } from 'react'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')

function formatScanDate(value) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

async function apiFetch(path, options = {}) {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		...options,
		headers: { 'Content-Type': 'application/json', ...options.headers },
	})
	const payload = await response.json().catch(() => null)
	if (!response.ok) throw new Error(payload?.error?.message || 'The request could not be completed.')
	return payload
}

function WebsiteAnalysisPage({ onNavigate }) {
	const [brands, setBrands] = useState([])
	const [selectedBrandId, setSelectedBrandId] = useState('')
	const [candidateUrl, setCandidateUrl] = useState('')
	const [isLoadingBrands, setIsLoadingBrands] = useState(true)
	const [isAnalyzing, setIsAnalyzing] = useState(false)
	const [loadError, setLoadError] = useState('')
	const [error, setError] = useState('')
	const [result, setResult] = useState(null)
	const [scanHistory, setScanHistory] = useState([])
	const [selectedScanId, setSelectedScanId] = useState('')
	const [isLoadingHistory, setIsLoadingHistory] = useState(false)
	const [historyError, setHistoryError] = useState('')

	useEffect(() => {
		const controller = new AbortController()
		async function loadBrands() {
			try {
				const payload = await apiFetch('/api/brands', { signal: controller.signal })
				if (payload?.status !== 'success' || !Array.isArray(payload.data?.brands)) {
					throw new Error('Saved brand profiles could not be loaded.')
				}
				setBrands(payload.data.brands)
				if (payload.data.brands.length) setSelectedBrandId(String(payload.data.brands[0]._id))
			} catch (loadFailure) {
				if (!controller.signal.aborted) setLoadError(loadFailure.message || 'Saved brand profiles could not be loaded.')
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
			try {
				const payload = await apiFetch(`/api/brands/${encodeURIComponent(selectedBrandId)}/domain-scans`, { signal: controller.signal })
				if (payload?.status !== 'success' || !Array.isArray(payload.data?.scans)) {
					throw new Error('Domain scan history could not be loaded.')
				}
				setScanHistory(payload.data.scans)
				setSelectedScanId(payload.data.scans[0]?._id || '')
			} catch (historyFailure) {
				if (!controller.signal.aborted) setHistoryError(historyFailure.message || 'Domain scan history could not be loaded.')
			} finally {
				if (!controller.signal.aborted) setIsLoadingHistory(false)
			}
		}
		loadHistory()
		return () => controller.abort()
	}, [selectedBrandId])

	function handleBrandChange(event) {
		setSelectedBrandId(event.target.value)
		setScanHistory([])
		setSelectedScanId('')
		setResult(null)
		setError('')
		setHistoryError('')
	}

	function selectHistoryScan(scanId) {
		setSelectedScanId(scanId)
		const scan = scanHistory.find((s) => s._id === scanId)
		if (scan) {
			setResult({
				assessment: {
					candidateUrl: scan.candidateUrl,
					candidateHostname: scan.candidateHostname,
					officialDomain: scan.officialDomain,
					score: scan.score,
					riskLevel: scan.riskLevel,
					status: scan.status,
					similarity: scan.similarity,
					signals: scan.signals,
					reasons: scan.reasons,
					limitations: scan.limitations,
				},
				brandName: scan.brandName,
				source: 'saved_scan_history',
				analyzedAt: scan.analyzedAt,
			})
			setError('')
		}
	}

	function handleReset() {
		setCandidateUrl('')
		setResult(null)
		setError('')
		setSelectedScanId('')
	}

	async function handleSubmit(event) {
		event.preventDefault()
		setError('')
		setResult(null)
		if (!selectedBrandId) {
			setError('Select a saved brand profile with at least one official domain or website URL.')
			return
		}
		try {
			const candidate = new URL(candidateUrl.trim())
			if (!['http:', 'https:'].includes(candidate.protocol) || !candidate.hostname) throw new Error()
		} catch {
			setError('Enter a complete candidate URL beginning with http:// or https://.')
			return
		}

		setIsAnalyzing(true)
		try {
			const payload = await apiFetch('/api/analyze/website', {
				method: 'POST',
				body: JSON.stringify({ brandId: selectedBrandId, candidateUrl: candidateUrl.trim() }),
			})
			if (payload?.status !== 'success' || !payload.data?.assessment) {
				throw new Error('The backend returned an invalid domain assessment.')
			}
			setResult(payload.data)

			// Persist the result to scan history (best-effort — don't block the UI on failure).
			apiFetch(`/api/brands/${encodeURIComponent(selectedBrandId)}/domain-scans`, {
				method: 'POST',
				body: JSON.stringify({ assessment: payload.data.assessment, brandName: payload.data.brandName }),
			}).then((saved) => {
				if (saved?.data?.scan) {
					setScanHistory((current) => [saved.data.scan, ...current])
					setSelectedScanId(saved.data.scan._id)
				}
			}).catch(() => {})
		} catch (analysisError) {
			setError(analysisError.message || 'Website domain analysis could not be completed.')
		} finally {
			setIsAnalyzing(false)
		}
	}

	const selectedBrand = brands.find((b) => String(b._id) === selectedBrandId)

	return (
		<section className="panel analyzer-panel website-analysis-page">
			<div className="analyzer-header">
				<div>
					<p className="eyebrow">Domain screening</p>
					<h1>Manual website domain analysis</h1>
				</div>
				<div className="analyzer-badge">Hostname comparison · no site fetched</div>
			</div>

			{loadError && <div className="message-box error-box" role="alert"><p>Saved brands are unavailable: {loadError}</p></div>}
			{error && <div className="message-box error-box" role="alert"><p>{error}</p></div>}

			<form className="profile-form" onSubmit={handleSubmit} noValidate>
				<div className="form-grid">
					<label className="field">
						<span>Saved brand reference <b aria-hidden="true">*</b></span>
						<select value={selectedBrandId} onChange={handleBrandChange} disabled={isLoadingBrands || brands.length === 0}>
							<option value="">{isLoadingBrands ? 'Loading saved brands…' : 'Select a saved brand'}</option>
							{brands.map((brand) => <option key={brand._id} value={brand._id}>{brand.brandName}</option>)}
						</select>
					</label>
					<label className="field">
						<span>Candidate website URL <b aria-hidden="true">*</b></span>
						<input
							type="url"
							value={candidateUrl}
							onChange={(event) => setCandidateUrl(event.target.value)}
							placeholder={selectedBrand ? `https://${selectedBrand.brandName.toLowerCase().replace(/\s+/g, '')}-support.com` : 'https://example-support.com'}
							aria-invalid={Boolean(error)}
						/>
					</label>
				</div>
				{!isLoadingBrands && brands.length === 0 && !loadError && (
					<p className="website-empty-brands">No saved brands available. <button type="button" className="inline-action" onClick={() => onNavigate('brand-profile')}>Create a Brand Profile</button> first.</p>
				)}
				<div className="form-actions">
					<button type="submit" className="primary-button" disabled={isLoadingBrands || isAnalyzing || !selectedBrandId}>
						{isAnalyzing ? 'Comparing domains…' : 'Analyze candidate domain'}
					</button>
				</div>
			</form>

			{historyError && <div className="profile-message profile-error" role="alert">Could not load prior scans: {historyError}</div>}
			{isLoadingHistory && <div className="profile-message profile-loading" role="status">Loading saved scan history…</div>}

			{scanHistory.length > 0 && (
				<div className="panel app-scan-history">
					<label className="field" htmlFor="domain-scan-history-select">
						<span>Saved scan history</span>
						<select
							id="domain-scan-history-select"
							value={selectedScanId}
							onChange={(event) => selectHistoryScan(event.target.value)}
						>
							{scanHistory.map((scan) => (
								<option key={scan._id} value={scan._id} className={`risk-option-${scan.riskLevel.toLowerCase()}`}>
									{formatScanDate(scan.analyzedAt)} · {scan.candidateHostname} · {scan.riskLevel}
								</option>
							))}
						</select>
					</label>
				</div>
			)}

			{result && (
				<div className="results-panel" aria-live="polite">
					<div className="results-header">
						<div><p className="eyebrow">Manual candidate submission · {result.source}</p><h2>{result.brandName}</h2></div>
						<div className={`risk-pill ${result.assessment.riskLevel.toLowerCase()}`}>{result.assessment.riskLevel}</div>
					</div>
					<p className={`assessment-status ${result.assessment.status === 'OFFICIAL_MATCH' ? 'official-match' : ''}`}>
						Review status: <strong>{result.assessment.status}</strong>
					</p>
					<div className="risk-score-row"><span>Domain similarity score</span><strong>{result.assessment.score}/100</strong></div>
					<div className="result-grid">
						<div className="result-card">
							<h3>Domains compared</h3>
							<ul>
								<li><span>Candidate hostname</span><strong>{result.assessment.candidateHostname}</strong></li>
								<li><span>Official reference</span><strong>{result.assessment.officialDomain}</strong></li>
								<li><span>Hostname similarity</span><strong>{result.assessment.similarity}%</strong></li>
							</ul>
						</div>
						<div className="result-card">
							<h3>Evidence signals</h3>
							<ul className="reason-list">{result.assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
						</div>
					</div>
					<div className="disclaimer-box">
						<strong>Limitations</strong>
						<ul className="assessment-limitations">{result.assessment.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
					</div>
					<div className="results-actions">
						<button type="button" className="primary-button" onClick={handleReset}>Analyze Another URL</button>
					</div>
				</div>
			)}
		</section>
	)
}

export default WebsiteAnalysisPage
