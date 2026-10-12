import { useEffect, useMemo, useState } from 'react'
import BrandProfilePage from './BrandProfilePage.jsx'
import './App.css'

const navItems = [
	{ id: 'overview', label: 'Overview', icon: 'overview' },
	{ id: 'brand-profile', label: 'Brand Profile', icon: 'profile' },
	{ id: 'social', label: 'Social Threat Analysis', icon: 'social' },
	{ id: 'mobile', label: 'Mobile App Analysis', icon: 'mobile' },
	{ id: 'website', label: 'Website & URL Analysis', icon: 'website' },
	{ id: 'reports', label: 'Threat Reports', icon: 'reports' },
	{ id: 'investigations', label: 'Investigations', icon: 'investigations' },
	{ id: 'settings', label: 'Settings', icon: 'settings' },
]

const demoReports = [
	{
		id: 1,
		target: '@brandxofficial',
		type: 'Impersonation',
		riskScore: 92,
		riskLevel: 'High',
		status: 'Open',
		date: '2026-10-10',
	},
	{
		id: 2,
		target: 'app.brandpro.ai',
		type: 'Phishing URL',
		riskScore: 81,
		riskLevel: 'High',
		status: 'Monitoring',
		date: '2026-10-09',
	},
	{
		id: 3,
		target: 'BrandNest Mobile',
		type: 'App Risk',
		riskScore: 64,
		riskLevel: 'Medium',
		status: 'Investigating',
		date: '2026-10-07',
	},
	{
		id: 4,
		target: 'market-portal.co',
		type: 'Fake Storefront',
		riskScore: 43,
		riskLevel: 'Low',
		status: 'Resolved',
		date: '2026-10-05',
	},
	{
		id: 5,
		target: 'support-brandtix',
		type: 'Fake Support',
		riskScore: 76,
		riskLevel: 'Medium',
		status: 'Open',
		date: '2026-10-03',
	},
]

const categoryData = [
	{ name: 'Impersonation', value: 34, color: '#7C6CFF' },
	{ name: 'Phishing', value: 26, color: '#5FA7FF' },
	{ name: 'App Abuse', value: 21, color: '#7FE0C3' },
	{ name: 'URL Fraud', value: 19, color: '#E7B86B' },
]

const recentActivity = [
	{
		title: 'New impersonation cluster detected',
		detail: 'Linked to 3 fake storefronts',
		time: '12 min ago',
		level: 'High',
	},
	{
		title: 'URL reputation check queued',
		detail: 'Reviewing 6 suspicious domains',
		time: '38 min ago',
		level: 'Medium',
	},
	{
		title: 'App storefront profile reviewed',
		detail: 'Detected malicious bundle references',
		time: '1 hour ago',
		level: 'Low',
	},
]

const statsConfig = [
	{ label: 'Total Reports', value: 128, tone: 'primary' },
	{ label: 'High Risk', value: 24, tone: 'danger' },
	{ label: 'Medium Risk', value: 41, tone: 'warning' },
	{ label: 'Low Risk', value: 52, tone: 'success' },
	{ label: 'Open Investigations', value: 7, tone: 'neutral' },
]

const pageMeta = {
	overview: { title: 'Overview', eyebrow: 'Executive dashboard' },
	'brand-profile': { title: 'Brand Profile', eyebrow: 'Official brand references' },
	social: { title: 'Social Threat Analysis', eyebrow: 'Threat intelligence' },
	mobile: { title: 'Mobile App Analysis', eyebrow: 'App monitoring' },
	website: { title: 'Website & URL Analysis', eyebrow: 'Domain screening' },
	reports: { title: 'Threat Reports', eyebrow: 'Report archive' },
	investigations: { title: 'Investigations', eyebrow: 'Case management' },
	settings: { title: 'Settings', eyebrow: 'Workspace controls' },
	'profile-analyzer': { title: 'Social Threat Analysis', eyebrow: 'Profile investigation' },
	'url-analyzer': { title: 'Analyze URL', eyebrow: 'Domain inspection' },
}

const profileFormDefaults = {
	platform: 'Instagram',
	brandId: '',
	brandName: '',
	officialUsername: '',
	suspiciousUsername: '',
	profileUrl: '',
	suspiciousBehavior: '',
	paymentRequested: false,
	credentialRequested: false,
}

function App() {
	const [activeView, setActiveView] = useState('overview')
	const [query, setQuery] = useState('')
	const [riskFilter, setRiskFilter] = useState('All')
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

	const filteredReports = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase()

		return demoReports.filter((report) => {
			const matchesQuery =
				normalizedQuery.length === 0 ||
				[report.target, report.type, report.status].some((value) =>
					value.toLowerCase().includes(normalizedQuery),
				)

			const matchesRisk = riskFilter === 'All' || report.riskLevel === riskFilter
			return matchesQuery && matchesRisk
		})
	}, [query, riskFilter])

	const currentTitle = pageMeta[activeView]?.title || 'Overview'

	function renderContent() {
		if (activeView === 'overview') {
			return (
				<OverviewPage
					reports={filteredReports}
					query={query}
					riskFilter={riskFilter}
					onQueryChange={setQuery}
					onRiskFilterChange={setRiskFilter}
					onNavigate={setActiveView}
				/>
			)
		}

		if (activeView === 'social' || activeView === 'profile-analyzer') {
			return <ProfileAnalyzerPage />
		}

		if (activeView === 'brand-profile') {
			return <BrandProfilePage />
		}

		if (activeView === 'url-analyzer') {
			return (
				<PlaceholderPage
					title={pageMeta[activeView].title}
					description="This analyzer workflow will be connected in the next development stage. The current screen is a placeholder to confirm that navigation and layout are working correctly."
					detail="Input validation, API hooks, scan orchestration, and generated findings will be added in Task 2."
				/>
			)
		}

		return (
			<PlaceholderPage
				title={pageMeta[activeView].title}
				description="This dashboard section is scheduled for the next development stage."
				detail="The BrandProtect AI workflow and reporting logic for this module will be implemented after the dashboard foundation is complete."
			/>
		)
	}

	return (
		<div className="app-shell">
			<Sidebar
				activeView={activeView}
				onSelect={setActiveView}
				collapsed={sidebarCollapsed}
				onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
				mobileOpen={sidebarOpen}
				onToggleMobile={() => setSidebarOpen((prev) => !prev)}
			/>

			<main className="main-panel">
				<Topbar
					title={currentTitle}
					query={query}
					onQueryChange={setQuery}
					onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
				/>

				<div className="page-inner">{renderContent()}</div>
			</main>
		</div>
	)
}

function Sidebar({ activeView, onSelect, collapsed, onToggleCollapse, mobileOpen, onToggleMobile }) {
	return (
		<>
			<button
				type="button"
				className="mobile-menu-button"
				aria-label="Toggle navigation menu"
				aria-expanded={mobileOpen}
				onClick={onToggleMobile}
			>
				<MenuIcon />
			</button>

			<aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
				<div className="sidebar-header">
					<div className="brand-mark" aria-hidden="true">
						<span>B</span>
					</div>
					{!collapsed && (
						<div className="brand-copy">
							<strong>BrandProtect AI</strong>
						</div>
					)}
					<button
						type="button"
						className="collapse-toggle"
						aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
						onClick={onToggleCollapse}
					>
						{collapsed ? '»' : '«'}
					</button>
				</div>

				<nav className="sidebar-nav" aria-label="Dashboard navigation">
					{navItems.map((item) => (
						<button
							key={item.id}
							type="button"
							className={`nav-item ${activeView === item.id ? 'active' : ''}`}
							aria-current={activeView === item.id ? 'page' : undefined}
							onClick={() => {
								onSelect(item.id)
								onToggleMobile()
							}}
						>
							<span className="nav-icon" aria-hidden="true">
								<NavIcon name={item.icon} />
							</span>
							{!collapsed && <span>{item.label}</span>}
						</button>
					))}
				</nav>
			</aside>
		</>
	)
}

function Topbar({ title, query, onQueryChange, onToggleSidebar }) {
	return (
		<header className="topbar">
			<div className="topbar-left">
				<button
					type="button"
					className="menu-trigger"
					aria-label="Open navigation"
					onClick={onToggleSidebar}
				>
					<MenuIcon />
				</button>
				<div className="header-copy-block">
					<p className="eyebrow">BrandProtect AI</p>
					<h2>{title}</h2>
				</div>
			</div>

			<div className="topbar-tools">
				<label className="search-box" htmlFor="global-search">
					<SearchIcon />
					<input
						id="global-search"
						type="search"
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="Search reports"
						aria-label="Search reports"
					/>
				</label>

				<button type="button" className="icon-button" aria-label="Notifications">
					<BellIcon />
				</button>

				<div className="profile-chip" aria-label="Current analyst profile">
					<div className="avatar">AR</div>
					<div className="profile-meta">
						<strong>Analyst</strong>
						<span>Risk Team</span>
					</div>
				</div>
			</div>
		</header>
	)
}

function OverviewPage({ reports, query, riskFilter, onQueryChange, onRiskFilterChange, onNavigate }) {
	return (
		<>
			<section className="hero-panel panel">
				<div className="hero-copy-column">
					<p className="eyebrow">BrandProtect AI</p>
					<h1>Detect digital threats. Protect your brand.</h1>
					<p className="hero-copy">
						Investigate suspicious profiles, assess potential impersonation, and organize digital threat reports in one workspace.
					</p>
				</div>

				<div className="hero-actions">
					<button type="button" className="primary-button" onClick={() => onNavigate('profile-analyzer')}>
						Analyze Profile
					</button>
					<button type="button" className="secondary-button" onClick={() => onNavigate('url-analyzer')}>
						Analyze URL
					</button>
				</div>
			</section>

			<section className="stats-grid" aria-label="Dashboard statistics">
				{statsConfig.map((stat) => (
					<StatCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
				))}
			</section>

			<section className="panel table-panel">
				<div className="panel-header">
					<div className="header-copy">
						<h2>Recent Threat Reports</h2>
						<span className="demo-label">Demo Data</span>
					</div>

					<div className="table-controls">
						<label className="mini-search" htmlFor="report-search">
							<SearchIcon />
							<input
								id="report-search"
								type="search"
								value={query}
								onChange={(event) => onQueryChange(event.target.value)}
								placeholder="Filter targets"
								aria-label="Filter threat reports"
							/>
						</label>

						<label className="filter-select" htmlFor="risk-filter">
							<span>Risk</span>
							<select
								id="risk-filter"
								value={riskFilter}
								onChange={(event) => onRiskFilterChange(event.target.value)}
								aria-label="Filter by risk level"
							>
								<option value="All">All</option>
								<option value="High">High</option>
								<option value="Medium">Medium</option>
								<option value="Low">Low</option>
							</select>
						</label>
					</div>
				</div>

				{reports.length > 0 ? (
					<ThreatTable reports={reports} />
				) : (
					<EmptyState
						title="No matching demo reports"
						description="Submitted reports will appear here after report persistence is implemented."
					/>
				)}
			</section>

			<div className="secondary-grid">
				<section className="panel chart-panel">
					<div className="panel-header compact">
						<h2>Threat Category Distribution</h2>
						<span className="panel-note">Demo Data</span>
					</div>
					<div className="chart-list" aria-label="Threat category chart">
						{categoryData.map((item) => (
							<div key={item.name} className="chart-row">
								<div className="chart-label-row">
									<span>{item.name}</span>
									<strong>{item.value}%</strong>
								</div>
								<div className="bar-track">
									<span className="bar-fill" style={{ width: `${item.value}%`, background: item.color }} />
								</div>
							</div>
						))}
					</div>
				</section>

				<section className="panel activity-panel">
					<div className="panel-header compact">
						<h2>Recent Activity</h2>
						<span className="panel-note">Live feed placeholder</span>
					</div>

					<ul className="activity-list">
						{recentActivity.map((item) => (
							<li key={item.title}>
								<div className="activity-dot" aria-hidden="true" />
								<div className="activity-copy">
									<div className="activity-header">
										<strong>{item.title}</strong>
										<RiskBadge level={item.level} compact />
									</div>
									<p>{item.detail}</p>
									<span>{item.time}</span>
								</div>
							</li>
						))}
					</ul>
				</section>
			</div>
		</>
	)
}

function ProfileAnalyzerPage() {
	const [form, setForm] = useState(profileFormDefaults)
	const [brands, setBrands] = useState([])
	const [providers, setProviders] = useState([])
	const [logoInputs, setLogoInputs] = useState({})
	const [logoResults, setLogoResults] = useState({})
	const [logoLoading, setLogoLoading] = useState({})
	const [isLoadingBrands, setIsLoadingBrands] = useState(true)
	const [brandLoadError, setBrandLoadError] = useState('')
	const [errors, setErrors] = useState({})
	const [isLoading, setIsLoading] = useState(false)
	const [result, setResult] = useState(null)
	const [submitError, setSubmitError] = useState('')

	const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')

	useEffect(() => {
		const controller = new AbortController()

		async function loadBrands() {
			try {
				const response = await fetch(`${apiBaseUrl}/api/brands`, { signal: controller.signal })
				const payload = await response.json().catch(() => null)
				if (!response.ok || payload?.status !== 'success' || !Array.isArray(payload.data?.brands)) {
					throw new Error(payload?.error?.message || 'Saved brand profiles could not be loaded.')
				}
				const loadedBrands = payload.data.brands.map((brand) => ({
					...brand,
					id: String(brand._id || brand.id || ''),
				}))
				setBrands(loadedBrands)
				setForm((current) => {
					if (current.brandId || current.brandName || current.officialUsername || !loadedBrands.length) return current
					return { ...current, brandId: loadedBrands[0].id, brandName: loadedBrands[0].brandName || '' }
				})
			} catch (error) {
				if (!controller.signal.aborted) setBrandLoadError(error.message || 'Saved brand profiles could not be loaded.')
			} finally {
				if (!controller.signal.aborted) setIsLoadingBrands(false)
			}
		}

		loadBrands()
		return () => controller.abort()
	}, [apiBaseUrl])

	function handleChange(event) {
		const { name, value, type, checked } = event.target
		if (name === 'brandId') {
			const brand = brands.find((item) => item.id === value)
			setForm((current) => ({ ...current, brandId: value, brandName: brand?.brandName || '' }))
		} else {
			setForm((current) => ({
				...current,
				[name]: type === 'checkbox' ? checked : value,
			}))
		}
		setErrors((current) => ({ ...current, [name]: '' }))
	}

	function validateForm() {
		const nextErrors = {}
		const candidates = form.suspiciousUsername.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)

		if (!form.platform.trim()) nextErrors.platform = 'Please select a platform.'
		if (!form.brandId && !form.brandName.trim()) nextErrors.brandName = 'Brand name is required for a manual comparison.'
		if (!candidates.length) nextErrors.suspiciousUsername = 'Enter at least one username or profile URL.'
		if (candidates.length > 50) nextErrors.suspiciousUsername = 'Submit at most 50 candidates per scan.'
		if (providers.length && candidates.length > 10) nextErrors.suspiciousUsername = 'Provider lookups are limited to 10 candidates per request.'
		if (candidates.some((candidate) => candidate.length > 500)) nextErrors.suspiciousUsername = 'Each username or profile URL must be at most 500 characters.'

		setErrors(nextErrors)
		return Object.keys(nextErrors).length === 0
	}

	async function handleSubmit(event) {
		event.preventDefault()
		setSubmitError('')
		setResult(null)
		setLogoResults({})

		if (!validateForm()) {
			return
		}

		setIsLoading(true)

		try {
			const candidates = form.suspiciousUsername.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
			const reportedSignals = {}
			if (form.paymentRequested) reportedSignals.paymentRequested = true
			if (form.credentialRequested) reportedSignals.credentialRequested = true
			const requestBody = {
				candidates: candidates.map((candidate) => /^https?:\/\//i.test(candidate)
					? { platform: form.platform, profileUrl: candidate }
					: { platform: form.platform, username: candidate }),
				providers,
				reportedSignals,
			}
			if (form.brandId) {
				requestBody.brandId = form.brandId
			} else {
				requestBody.brandName = form.brandName
				requestBody.officialAccounts = form.officialUsername.trim()
					? [{ platform: form.platform, username: form.officialUsername }]
					: []
			}
			if (form.profileUrl.trim()) requestBody.profileUrl = form.profileUrl.trim()

			const response = await fetch(`${apiBaseUrl}/api/social/scan-candidates`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			})

			const payload = await response.json().catch(() => null)

			if (!response.ok) {
				throw new Error(payload?.error?.message || payload?.error || 'The candidate scan request could not be completed.')
			}

			if (!payload || typeof payload !== 'object') {
				throw new Error('The server returned an invalid response.')
			}

			if (!Array.isArray(payload.findings) || typeof payload.scanStatus !== 'string') {
				throw new Error('The candidate scan response was incomplete.')
			}

			setResult({
				...payload,
				referenceSource: form.brandId ? 'Saved brand profile' : 'Manual brand details',
			})
		} catch (error) {
			setSubmitError(error.message || 'Unable to analyze the profile right now.')
		} finally {
			setIsLoading(false)
		}
	}

	function handleReset() {
		const firstBrand = brands[0]
		setForm({
			...profileFormDefaults,
			brandId: firstBrand?.id || '',
			brandName: firstBrand?.brandName || '',
		})
		setErrors({})
		setSubmitError('')
		setResult(null)
		setProviders([])
		setLogoInputs({})
		setLogoResults({})
		setLogoLoading({})
	}

	async function compareCandidateLogo(finding, logoKey, brandId) {
		const candidateImageUrl = (logoInputs[logoKey] || '').trim()
		if (!candidateImageUrl) {
			setLogoResults((current) => ({
				...current,
				[logoKey]: { status: 'CANDIDATE_IMAGE_MISSING', explanation: 'Enter a candidate image URL to compare logos.' },
			}))
			return
		}

		setLogoLoading((current) => ({ ...current, [logoKey]: true }))
		setLogoResults((current) => ({ ...current, [logoKey]: null }))
		try {
			const response = await fetch(`${apiBaseUrl}/api/analyze/logo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandId,
					candidateId: `${finding.candidate.platform}:${finding.candidate.username}`,
					candidateUsername: finding.candidate.username,
					candidateImageUrl,
				}),
			})
			const payload = await response.json().catch(() => null)
			if (!response.ok || payload?.ok !== true) {
				throw new Error(payload?.error?.message || 'Logo comparison could not be completed.')
			}
			setLogoResults((current) => ({ ...current, [logoKey]: payload }))
		} catch (error) {
			setLogoResults((current) => ({
				...current,
				[logoKey]: { status: 'REQUEST_FAILED', explanation: error.message || 'Logo comparison could not be completed.' },
			}))
		} finally {
			setLogoLoading((current) => ({ ...current, [logoKey]: false }))
		}
	}

	return (
		<section className="panel analyzer-panel">
			<div className="analyzer-header">
				<div>
					<p className="eyebrow">Threat intelligence</p>
					<h1>Review social candidates</h1>
				</div>
					<div className="analyzer-badge">Manual candidates · Not live monitoring</div>
			</div>
				<p className="analysis-note">Compare submitted handles with a saved brand profile or manually supplied references. Optional provider lookups query only those exact usernames; no discovery, scraping, or continuous monitoring is performed.</p>

			{brandLoadError && (
				<div className="message-box info-box" role="status">
					<strong>Saved profiles unavailable.</strong>
					<p>{brandLoadError} Manual comparison is still available.</p>
				</div>
			)}

			<form className="profile-form" onSubmit={handleSubmit} noValidate>
				<div className="form-grid">
					{(brands.length > 0 || isLoadingBrands) && (
						<label className="field">
							<span>Brand reference</span>
							<select name="brandId" value={form.brandId} onChange={handleChange}>
								<option value="">Manual brand details</option>
								{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.brandName}</option>)}
							</select>
						</label>
					)}

					{!form.brandId && (
						<>
							<label className="field">
								<span>Brand name</span>
								<input type="text" name="brandName" value={form.brandName} onChange={handleChange} placeholder="Amazon" aria-invalid={Boolean(errors.brandName)} />
								{errors.brandName && <small>{errors.brandName}</small>}
							</label>
							<label className="field">
								<span>Official username (optional)</span>
								<input type="text" name="officialUsername" value={form.officialUsername} onChange={handleChange} placeholder="amazon" />
							</label>
						</>
					)}

					<label className="field">
						<span>Social platform</span>
						<select name="platform" value={form.platform} onChange={handleChange} aria-invalid={Boolean(errors.platform)}>
							<option value="Instagram">Instagram</option>
							<option value="Facebook">Facebook</option>
							<option value="X">X</option>
							<option value="LinkedIn">LinkedIn</option>
							<option value="YouTube">YouTube</option>
							<option value="Other">Other</option>
						</select>
						{errors.platform && <small>{errors.platform}</small>}
					</label>

					<label className="field field-full">
						<span>Candidate usernames or profile URLs</span>
						<textarea
							name="suspiciousUsername"
							value={form.suspiciousUsername}
							onChange={handleChange}
							placeholder={'amazon_support\nhttps://www.instagram.com/amazon_help/'}
							rows="4"
							aria-invalid={Boolean(errors.suspiciousUsername)}
						/>
						{errors.suspiciousUsername && <small>{errors.suspiciousUsername}</small>}
					</label>

					<label className="field field-full">
						<span>Case notes (not scored)</span>
						<textarea
							name="suspiciousBehavior"
							value={form.suspiciousBehavior}
							onChange={handleChange}
							placeholder="Optional context for the human reviewer"
							rows="5"
						/>
					</label>

					<label className="checkbox-row">
						<input
							type="checkbox"
							name="paymentRequested"
							checked={form.paymentRequested}
							onChange={handleChange}
						/>
						<span>A payment request was reported</span>
					</label>

					<label className="checkbox-row">
						<input
							type="checkbox"
							name="credentialRequested"
							checked={form.credentialRequested}
							onChange={handleChange}
						/>
						<span>A password, OTP, or sensitive credential was requested</span>
					</label>

					<fieldset className="provider-options field-full">
						<legend>Optional official API lookup</legend>
						<label className="checkbox-row">
							<input type="checkbox" checked={providers.includes('META_INSTAGRAM')} onChange={() => setProviders((current) => current.includes('META_INSTAGRAM') ? current.filter((item) => item !== 'META_INSTAGRAM') : [...current, 'META_INSTAGRAM'])} />
							<span>Meta Instagram Business Discovery (eligible professional accounts)</span>
						</label>
						<label className="checkbox-row">
							<input type="checkbox" checked={providers.includes('X_API')} onChange={() => setProviders((current) => current.includes('X_API') ? current.filter((item) => item !== 'X_API') : [...current, 'X_API'])} />
							<span>X API username lookup (plan and access dependent)</span>
						</label>
						<label className="checkbox-row">
							<input type="checkbox" checked={providers.includes('LINKEDIN')} onChange={() => setProviders((current) => current.includes('LINKEDIN') ? current.filter((item) => item !== 'LINKEDIN') : [...current, 'LINKEDIN'])} />
							<span>LinkedIn (not available for arbitrary public profile lookup)</span>
						</label>
					</fieldset>
				</div>
				{!brands.length && !isLoadingBrands && !brandLoadError && (
					<p className="analysis-note">No saved brand profiles are available. Add a brand name and any known official username for a manual comparison.</p>
				)}
				{isLoadingBrands && <p className="analysis-note" role="status">Checking for saved brand profiles…</p>}

				<div className="form-actions">
					<button type="submit" className="primary-button" disabled={isLoading}>
						{isLoading ? 'Reviewing candidates…' : 'Review Candidates'}
					</button>
					<button type="button" className="secondary-button" onClick={handleReset}>
						Reset
					</button>
				</div>
				{isLoading && (
					<p className="analysis-note" role="status">
						Submitting {form.suspiciousUsername.split(/\r?\n/).filter((value) => value.trim()).length} candidate(s); requested provider lookups are in progress.
					</p>
				)}
			</form>

			{submitError && (
				<div className="message-box error-box" role="alert">
					<strong>Analysis unavailable.</strong>
					<p>{submitError}</p>
				</div>
			)}

			{result && (
				<div className="results-panel" aria-live="polite">
					<div className="results-header">
						<div>
							<p className="eyebrow">Candidate intake complete</p>
							<h2>{result.candidateCount} candidate{result.candidateCount === 1 ? '' : 's'}</h2>
						</div>
						<div className="scan-status-pill">
							{result.scanStatus.replaceAll('_', ' ')}
						</div>
					</div>
					<div className="analysis-status-row">
						<strong>{result.source === 'MANUAL_INPUT' ? 'Manual input' : result.source}</strong>
						<span>{result.brand?.name || form.brandName} · {result.referenceSource}</span>
					</div>
					{result.persistence?.status !== 'SAVED' && <p className="analysis-note">Scan history: {result.persistence?.message || 'not saved'}</p>}
					{result.findings.map((finding, index) => {
						const analysis = finding.analysis
						const logoKey = `${index}:${finding.candidate.platform}:${finding.candidate.username}`
						const logoResult = logoResults[logoKey]
						return (
							<article className="scan-finding" key={`${finding.candidate.platform}-${finding.candidate.username}-${index}`}>
								<div className="results-header">
									<div>
										<p className="eyebrow">{finding.source === 'MANUAL_INPUT' ? 'Manual input' : finding.source} · {finding.candidate.platform}</p>
										<h2>{finding.candidate.username}</h2>
										{finding.candidate.profileUrl && <a href={finding.candidate.profileUrl} target="_blank" rel="noreferrer">Submitted profile URL</a>}
									</div>
									<div className={`risk-pill ${analysis.riskLevel.toLowerCase()}`}>{analysis.riskLevel}</div>
								</div>
								<div className="analysis-status-row">
									<strong>{analysis.status.replaceAll('_', ' ')}</strong>
									<span>Heuristic score: {analysis.riskScore}/100 · normalized: {analysis.normalizedUsername}</span>
								</div>
								<div className="result-grid">
									<div className="result-card">
										<h3>Detection reasons</h3>
										<ul className="reason-list">{analysis.reasons.map((reason, reasonIndex) => <li key={`${reason}-${reasonIndex}`}>{reason}</li>)}</ul>
									</div>
									<div className="result-card">
										<h3>Provider responses</h3>
										{finding.providerResults.length ? (
											<ul className="reason-list">{finding.providerResults.map((providerResult) => (
												<li key={providerResult.provider}>
													<strong>{providerResult.provider}: {providerResult.status}</strong>
													{providerResult.profile && <span>Returned @{providerResult.profile.username}{providerResult.profile.displayName ? ` · ${providerResult.profile.displayName}` : ''}</span>}
													{providerResult.message && <span>{providerResult.message}</span>}
												</li>
											))}</ul>
										) : <p className="analysis-note">No provider lookup requested. The candidate was supplied manually.</p>}
									</div>
								</div>
								<section className="logo-comparison" aria-label={`Logo comparison for ${finding.candidate.username}`}>
									<div>
										<h3>Optional logo comparison</h3>
										<p>Visual evidence is separate from the username score and is never proof of impersonation.</p>
									</div>
									{result.brand?.id ? (
										<div className="logo-submit-row">
											<label className="field">
												<span>Candidate image URL</span>
												<input
													type="url"
													value={logoInputs[logoKey] || ''}
													onChange={(event) => setLogoInputs((current) => ({ ...current, [logoKey]: event.target.value }))}
													placeholder="https://images.example/candidate-logo.png"
												/>
											</label>
											<button type="button" className="secondary-button" disabled={Boolean(logoLoading[logoKey])} onClick={() => compareCandidateLogo(finding, logoKey, result.brand.id)}>
												{logoLoading[logoKey] ? 'Comparing…' : 'Compare logo'}
											</button>
										</div>
									) : (
										<p className="analysis-note">Save this brand profile with an official logo to enable reference comparison.</p>
									)}
									{logoLoading[logoKey] && <p className="analysis-note" role="status">Retrieving submitted image URLs and comparing normalized images…</p>}
									{logoResult && (
										<div className="logo-result" aria-live="polite">
											<div className="analysis-status-row">
												<strong>{logoResult.status?.replaceAll('_', ' ')}</strong>
												{logoResult.similarityScore !== null && logoResult.similarityScore !== undefined && <span>Similarity: {logoResult.similarityScore}/100</span>}
											</div>
											{logoResult.comparisonMethod && <p className="analysis-note">Method: {logoResult.comparisonMethod}</p>}
											<p>{logoResult.explanation}</p>
											{logoResult.reviewRecommendation && <p className="analysis-note">Recommendation: {logoResult.reviewRecommendation.replaceAll('_', ' ')}</p>}
											{logoResult.images && (
												<div className="logo-preview-grid">
													<figure><img src={logoResult.images.officialPreviewDataUrl} alt="Registered official brand logo preview" /><figcaption>Registered brand logo</figcaption></figure>
													<figure><img src={logoResult.images.candidatePreviewDataUrl} alt="Submitted candidate image preview" /><figcaption>Submitted candidate image</figcaption></figure>
												</div>
											)}
											{logoResult.limitations?.map((limitation) => <p className="analysis-note" key={limitation}>{limitation}</p>)}
										</div>
									)}
								</section>
								{analysis.limitations?.map((limitation) => <p className="analysis-note" key={limitation}>{limitation}</p>)}
							</article>
						)
					})}

					<div className="disclaimer-box">
						{result.disclaimer}
					</div>

					<div className="results-actions">
						<button type="button" className="primary-button" onClick={handleReset}>
							Analyze Another Profile
						</button>
					</div>
				</div>
			)}
		</section>
	)
}

function PlaceholderPage({ title, description, detail }) {
	return (
		<section className="panel placeholder-panel">
			<div className="placeholder-icon" aria-hidden="true">
				<ShieldIcon />
			</div>
			<p className="eyebrow">Coming in the next development stage</p>
			<h1>{title}</h1>
			<p className="placeholder-copy">{description}</p>
			<p className="placeholder-detail">{detail}</p>
		</section>
	)
}

function StatCard({ label, value, tone }) {
	return (
		<div className={`stat-card ${tone}`}>
			<div className="stat-topline">
				<span className="stat-label">{label}</span>
				<span className="stat-indicator" aria-hidden="true" />
			</div>
			<strong>{value}</strong>
		</div>
	)
}

function ThreatTable({ reports }) {
	return (
		<div className="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Target</th>
						<th>Threat Type</th>
						<th>Risk</th>
						<th>Status</th>
						<th>Date</th>
						<th>Action</th>
					</tr>
				</thead>
				<tbody>
					{reports.map((report) => (
						<tr key={report.id}>
							<td>{report.target}</td>
							<td>{report.type}</td>
							<td>{report.riskScore}</td>
							<td>
								<StatusBadge status={report.status} />
							</td>
							<td>{report.date}</td>
							<td>
								<button type="button" className="table-action">
									View
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

function EmptyState({ title, description }) {
	return (
		<div className="empty-state" role="status" aria-live="polite">
			<div className="empty-icon" aria-hidden="true">
				<ShieldIcon />
			</div>
			<h3>{title}</h3>
			<p>{description}</p>
		</div>
	)
}

function RiskBadge({ level, compact = false }) {
	const className = `risk-badge ${level.toLowerCase()} ${compact ? 'compact' : ''}`
	return <span className={className}>{level}</span>
}

function StatusBadge({ status }) {
	const normalized = status.toLowerCase().replace(/\s+/g, '-')
	return <span className={`status-badge ${normalized}`}>{status}</span>
}

function NavIcon({ name }) {
	const commonProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8' }

	switch (name) {
		case 'overview':
			return (
				<svg {...commonProps}>
					<path d="M4 12.5 12 4l8 8.5M6.5 10.5V19h11v-8.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)
		case 'social':
			return (
				<svg {...commonProps}>
					<path d="M7 18.5A3.5 3.5 0 0 1 10.5 15H13a4 4 0 0 1 4 4M9 9a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm-4 9.5h14" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)
		case 'profile':
			return (
				<svg {...commonProps}>
					<path d="M4 20h16M6 20v-1.5A4.5 4.5 0 0 1 10.5 14h3a4.5 4.5 0 0 1 4.5 4.5V20M9 7.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)
		case 'mobile':
			return (
				<svg {...commonProps}>
					<rect x="7" y="2.5" width="10" height="19" rx="2.5" />
					<path d="M10.2 6.5h3.6M11 18.2h2" strokeLinecap="round" />
				</svg>
			)
		case 'website':
			return (
				<svg {...commonProps}>
					<circle cx="12" cy="12" r="8" />
					<path d="M4 12h16M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16" strokeLinecap="round" />
				</svg>
			)
		case 'reports':
			return (
				<svg {...commonProps}>
					<path d="M7 4.5h7l4 4V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
					<path d="M14 4.5v4h4M8.5 11.5h7M8.5 15.5h7" strokeLinecap="round" />
				</svg>
			)
		case 'investigations':
			return (
				<svg {...commonProps}>
					<path d="M8 7.5V6a4 4 0 0 1 8 0v1.5M5.5 8.5h13v10a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-10Z" strokeLinejoin="round" />
					<path d="M12 12.5v3M9.8 15.5h4.4" strokeLinecap="round" />
				</svg>
			)
		case 'settings':
			return (
				<svg {...commonProps}>
					<path d="M12 3.5v2M12 18.5v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3.5 12h2M18.5 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
					<circle cx="12" cy="12" r="3.2" />
				</svg>
			)
		default:
			return null
	}
}

function SearchIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
			<circle cx="11" cy="11" r="5.75" />
			<path d="M16 16l4.25 4.25" strokeLinecap="round" />
		</svg>
	)
}

function BellIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
			<path d="M9 18h6M6.5 16.5h11l-1.2-8.5A4.8 4.8 0 0 0 11.5 4a4.8 4.8 0 0 0-4.8 4.1L6.5 16.5Z" strokeLinejoin="round" />
		</svg>
	)
}

function MenuIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
			<path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
		</svg>
	)
}

function ShieldIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
			<path d="M12 3.3 5.5 6v5.4c0 4 2.7 7.6 6.5 9.3 3.8-1.7 6.5-5.3 6.5-9.3V6L12 3.3Z" strokeLinejoin="round" />
			<path d="M9.3 11.8 11.1 13.6l3.6-4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export default App
