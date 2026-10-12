import { useEffect, useState } from 'react'

const SOCIAL_PLATFORMS = ['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube', 'Other']
const APP_PLATFORMS = ['Android', 'iOS', 'Other']

function createId() {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyDraft() {
	return {
		brandName: '',
		websiteUrl: '',
		industry: '',
		description: '',
		region: '',
		logoUrl: '',
		socialAccounts: [],
		officialApps: [],
	}
}

function toDraft(profile) {
	if (!profile) return emptyDraft()
	return {
		...emptyDraft(),
		brandName: typeof profile.brandName === 'string' ? profile.brandName : '',
		websiteUrl: typeof profile.websiteUrl === 'string' ? profile.websiteUrl : '',
		industry: typeof profile.industry === 'string' ? profile.industry : '',
		description: typeof profile.description === 'string' ? profile.description : '',
		region: typeof profile.region === 'string' ? profile.region : '',
		logoUrl: typeof profile.logoUrl === 'string' ? profile.logoUrl : '',
		socialAccounts: Array.isArray(profile.socialAccounts)
			? profile.socialAccounts.filter((account) => account && typeof account === 'object').map((account) => ({
				id: String(account._id || account.id || createId()),
				platform: SOCIAL_PLATFORMS.includes(account.platform) ? account.platform : 'Other',
				username: typeof account.username === 'string' ? account.username : '',
				profileUrl: typeof account.profileUrl === 'string' ? account.profileUrl : '',
				notes: typeof account.notes === 'string' ? account.notes : '',
			}))
			: [],
		officialApps: Array.isArray(profile.officialApps)
			? profile.officialApps.filter((app) => app && typeof app === 'object').map((app) => ({
				id: String(app._id || app.id || createId()),
				appName: typeof app.appName === 'string' ? app.appName : '',
				platform: APP_PLATFORMS.includes(app.platform) ? app.platform : 'Other',
				packageId: typeof app.packageId === 'string' ? app.packageId : '',
				storeUrl: typeof app.storeUrl === 'string' ? app.storeUrl : '',
				publisher: typeof app.publisher === 'string' ? app.publisher : '',
				iconUrl: typeof app.iconUrl === 'string' ? app.iconUrl : '',
			}))
			: [],
	}
}

function fromApiBrand(brand) {
	return {
		...brand,
		id: String(brand._id || brand.id),
		socialAccounts: Array.isArray(brand.socialAccounts) ? brand.socialAccounts : [],
		officialApps: Array.isArray(brand.officialApps) ? brand.officialApps : [],
	}
}

function toApiPayload(draft) {
	return {
		brandName: draft.brandName.trim(),
		websiteUrl: draft.websiteUrl.trim(),
		industry: draft.industry.trim(),
		description: draft.description.trim(),
		region: draft.region.trim(),
		logoUrl: draft.logoUrl.trim(),
		socialAccounts: draft.socialAccounts.map((account) => ({
			platform: account.platform,
			username: normalizeUsername(account.username || ''),
			profileUrl: (account.profileUrl || '').trim(),
			notes: (account.notes || '').trim(),
		})),
		officialApps: draft.officialApps.map((app) => ({
			appName: app.appName.trim(),
			platform: app.platform,
			packageId: (app.packageId || '').trim(),
			storeUrl: (app.storeUrl || '').trim(),
			publisher: (app.publisher || '').trim(),
			iconUrl: (app.iconUrl || '').trim(),
		})),
	}
}

async function requestApi(path, options = {}) {
	const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
	const response = await fetch(`${apiBaseUrl}${path}`, {
		...options,
		headers: { 'Content-Type': 'application/json', ...options.headers },
	})
	const result = await response.json().catch(() => null)
	if (!response.ok) {
		throw new Error(result?.error?.message || 'The backend request could not be completed.')
	}
	if (result?.status !== 'success' || !result.data) {
		throw new Error('The backend returned an unexpected response.')
	}
	return result.data
}

function normalizeUsername(username) {
	return username.trim().replace(/^@/, '').trim()
}

function isValidUrl(value) {
	if (!value.trim()) return true
	try {
		const url = new URL(value.trim())
		return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname)
	} catch {
		return false
	}
}

function validateDraft(draft) {
	const errors = {}
	if (!draft.brandName.trim()) errors.brandName = 'Brand or company name is required.'
	if (!isValidUrl(draft.websiteUrl)) errors.websiteUrl = 'Enter a valid http or https URL.'
	if (!isValidUrl(draft.logoUrl)) errors.logoUrl = 'Enter a valid http or https URL.'

	for (const account of draft.socialAccounts) {
		const username = normalizeUsername(account.username || '')
		const usernameKey = `account:${account.id}:username`
		const urlKey = `account:${account.id}:profileUrl`
		if (!username) errors[usernameKey] = 'An official username or handle is required.'
		if (!isValidUrl(account.profileUrl || '')) errors[urlKey] = 'Enter a valid http or https URL.'
		if (username && draft.socialAccounts.some((other) =>
			other.id !== account.id && other.platform === account.platform &&
			normalizeUsername(other.username || '').toLowerCase() === username.toLowerCase(),
		)) {
			errors[usernameKey] = 'This handle is already listed for this platform.'
		}
	}

	for (const app of draft.officialApps) {
		const nameKey = `app:${app.id}:appName`
		const storeKey = `app:${app.id}:storeUrl`
		const iconKey = `app:${app.id}:iconUrl`
		if (!app.appName.trim()) errors[nameKey] = 'App name is required.'
		if (!isValidUrl(app.storeUrl || '')) errors[storeKey] = 'Enter a valid http or https URL.'
		if (!isValidUrl(app.iconUrl || '')) errors[iconKey] = 'Enter a valid http or https URL.'
		const packageId = (app.packageId || '').trim().toLowerCase()
		if (packageId && draft.officialApps.some((other) =>
			other.id !== app.id && (other.packageId || '').trim().toLowerCase() === packageId,
		)) {
			errors[`app:${app.id}:packageId`] = 'This package or bundle ID is already listed.'
		}
	}

	return errors
}

function BrandProfilePage() {
	const [brands, setBrands] = useState([])
	const [selectedBrandId, setSelectedBrandId] = useState('')
	const [savedProfile, setSavedProfile] = useState(null)
	const [draft, setDraft] = useState(emptyDraft)
	const [errors, setErrors] = useState({})
	const [loadError, setLoadError] = useState('')
	const [apiError, setApiError] = useState('')
	const [message, setMessage] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [isSaving, setIsSaving] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false)
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
	const [pendingSelection, setPendingSelection] = useState(null)

	useEffect(() => {
		const controller = new AbortController()

		async function loadBrands() {
			setIsLoading(true)
			try {
				const data = await requestApi('/api/brands', { signal: controller.signal })
				if (!Array.isArray(data.brands)) throw new Error('The backend returned an invalid brand list.')
				const loadedBrands = data.brands.map(fromApiBrand)
				setLoadError('')
				setBrands(loadedBrands)
				if (loadedBrands.length > 0) {
					setSelectedBrandId(loadedBrands[0].id)
					setSavedProfile(loadedBrands[0])
					setDraft(toDraft(loadedBrands[0]))
				}
			} catch (error) {
				if (!controller.signal.aborted) setLoadError(`Could not load saved brand profiles: ${error.message}`)
			} finally {
				if (!controller.signal.aborted) setIsLoading(false)
			}
		}

		loadBrands()
		return () => controller.abort()
	}, [])

	function applySelection(brandId) {
		const brand = brands.find((item) => item.id === brandId) || null
		setSelectedBrandId(brandId)
		setSavedProfile(brand)
		setDraft(toDraft(brand))
		setHasUnsavedChanges(false)
		setErrors({})
		setApiError('')
		setMessage('')
		setPendingSelection(null)
		setIsDeleteConfirmationOpen(false)
	}

	function requestSelection(brandId) {
		if (hasUnsavedChanges) {
			setPendingSelection(brandId)
			return
		}
		applySelection(brandId)
	}

	function confirmPendingSelection() {
		if (pendingSelection !== null) applySelection(pendingSelection)
	}

	function updateDraft(name, value) {
		setDraft((current) => ({ ...current, [name]: value }))
		setHasUnsavedChanges(true)
		setErrors({})
		setMessage('')
	}

	function updateAccount(id, name, value) {
		setDraft((current) => ({
			...current,
			socialAccounts: current.socialAccounts.map((account) =>
				account.id === id ? { ...account, [name]: value } : account,
			),
		}))
		setHasUnsavedChanges(true)
		setErrors({})
		setMessage('')
	}

	function updateApp(id, name, value) {
		setDraft((current) => ({
			...current,
			officialApps: current.officialApps.map((app) =>
				app.id === id ? { ...app, [name]: value } : app,
			),
		}))
		setHasUnsavedChanges(true)
		setErrors({})
		setMessage('')
	}

	function addAccount() {
		setDraft((current) => ({
			...current,
			socialAccounts: [...current.socialAccounts, {
				id: createId(), platform: 'Instagram', username: '', profileUrl: '', notes: '',
			}],
		}))
		setHasUnsavedChanges(true)
		setMessage('')
	}

	function addApp() {
		setDraft((current) => ({
			...current,
			officialApps: [...current.officialApps, {
				id: createId(), appName: '', platform: 'Android', packageId: '', storeUrl: '', publisher: '', iconUrl: '',
			}],
		}))
		setHasUnsavedChanges(true)
		setMessage('')
	}

	function removeAccount(id) {
		setDraft((current) => ({ ...current, socialAccounts: current.socialAccounts.filter((account) => account.id !== id) }))
		setHasUnsavedChanges(true)
		setErrors({})
	}

	function removeApp(id) {
		setDraft((current) => ({ ...current, officialApps: current.officialApps.filter((app) => app.id !== id) }))
		setHasUnsavedChanges(true)
		setErrors({})
	}

	function handleReset() {
		setDraft(toDraft(savedProfile))
		setHasUnsavedChanges(false)
		setErrors({})
		setMessage('Unsaved changes were discarded.')
	}

	function startNewProfile() {
		requestSelection('')
	}

	async function handleSave(event) {
		event.preventDefault()
		const nextErrors = validateDraft(draft)
		setErrors(nextErrors)
		setMessage('')
		if (Object.keys(nextErrors).length) return

		setIsSaving(true)
		setApiError('')
		try {
			const path = selectedBrandId ? `/api/brands/${encodeURIComponent(selectedBrandId)}` : '/api/brands'
			const data = await requestApi(path, {
				method: selectedBrandId ? 'PUT' : 'POST',
				body: JSON.stringify(toApiPayload(draft)),
			})
			const profile = fromApiBrand(data.brand)
			setBrands((current) => {
				const updated = current.filter((brand) => brand.id !== profile.id)
				return [profile, ...updated]
			})
			setSelectedBrandId(profile.id)
			setSavedProfile(profile)
			setDraft(toDraft(profile))
			setHasUnsavedChanges(false)
			setLoadError('')
			setMessage('Brand profile saved to the backend.')
		} catch (error) {
			setApiError(`Brand profile was not saved: ${error.message}`)
		} finally {
			setIsSaving(false)
		}
	}

	async function handleDelete() {
		if (!selectedBrandId) return
		setIsDeleting(true)
		setApiError('')
		try {
			await requestApi(`/api/brands/${encodeURIComponent(selectedBrandId)}`, { method: 'DELETE' })
			const remainingBrands = brands.filter((brand) => brand.id !== selectedBrandId)
			setBrands(remainingBrands)
			setIsDeleteConfirmationOpen(false)
			setHasUnsavedChanges(false)
			setLoadError('')
			if (remainingBrands.length > 0) {
				applySelection(remainingBrands[0].id)
			} else {
				setSelectedBrandId('')
				setSavedProfile(null)
				setDraft(emptyDraft())
			}
			setMessage('Brand profile deleted from the backend.')
		} catch (error) {
			setApiError(`Brand profile was not deleted: ${error.message}`)
		} finally {
			setIsDeleting(false)
		}
	}

	return (
		<div className="brand-profile-page">
			<div className="brand-profile-intro">
				<div>
					<p className="eyebrow">Reference identity</p>
					<h1>Define your official presence</h1>
					<p>Keep the accounts and apps your team recognizes as official in one reference profile.</p>
				</div>
				<span className="prototype-label">Backend API</span>
			</div>

			{isLoading && <div className="profile-message profile-loading" role="status" aria-live="polite">Loading saved brand profiles…</div>}
			{loadError && <div className="profile-message profile-error" role="alert">{loadError}</div>}
			{apiError && <div className="profile-message profile-error" role="alert">{apiError}</div>}
			{message && <div className="profile-message profile-success" role="status" aria-live="polite">{message}</div>}

			<div className="panel brand-profile-toolbar">
				<label className="field" htmlFor="saved-brand-select">
					<span>Saved brand profiles</span>
					<select id="saved-brand-select" value={selectedBrandId} onChange={(event) => requestSelection(event.target.value)} disabled={isLoading || brands.length === 0}>
						<option value="">No saved brand selected</option>
						{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.brandName}</option>)}
					</select>
				</label>
				<button type="button" className="secondary-button" onClick={startNewProfile} disabled={isLoading}>Create new</button>
				{selectedBrandId && <button type="button" className="remove-button" onClick={() => setIsDeleteConfirmationOpen(true)} disabled={isDeleting}>Delete selected</button>}
			</div>

			{!isLoading && !loadError && brands.length === 0 && (
				<div className="profile-empty-state">No brand profiles are saved yet. Complete the form and create the first profile.</div>
			)}
			{pendingSelection !== null && (
				<div className="profile-message profile-confirmation" role="status">
					<span>Discard unsaved changes and switch profiles?</span>
					<button type="button" className="secondary-button" onClick={confirmPendingSelection}>Discard and continue</button>
					<button type="button" className="secondary-button" onClick={() => setPendingSelection(null)}>Keep editing</button>
				</div>
			)}
			{isDeleteConfirmationOpen && (
				<div className="profile-message profile-confirmation" role="alertdialog" aria-label="Confirm brand deletion">
					<span>Delete “{savedProfile?.brandName || 'this brand'}” from the backend? This cannot be undone.</span>
					<button type="button" className="secondary-button" onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Deleting…' : 'Confirm delete'}</button>
					<button type="button" className="secondary-button" onClick={() => setIsDeleteConfirmationOpen(false)} disabled={isDeleting}>Keep profile</button>
				</div>
				)}

			<form className="brand-profile-layout" onSubmit={handleSave} noValidate aria-busy={isLoading || isSaving}>
				<div className="brand-profile-editor">
					<section className="panel brand-section">
						<div className="brand-section-heading">
							<div><span className="section-index">01</span><h2>Basic brand information</h2></div>
							<p>Required to identify this profile within your workspace.</p>
						</div>
						<div className="brand-fields">
							<label className="field">
								<span>Brand or company name <b aria-hidden="true">*</b></span>
								<input value={draft.brandName} onChange={(event) => updateDraft('brandName', event.target.value)} aria-invalid={Boolean(errors.brandName)} aria-describedby={errors.brandName ? 'brand-name-error' : undefined} autoComplete="organization" />
								{errors.brandName && <small id="brand-name-error" role="alert">{errors.brandName}</small>}
							</label>
							<label className="field">
								<span>Website URL</span>
								<input type="url" value={draft.websiteUrl} onChange={(event) => updateDraft('websiteUrl', event.target.value)} placeholder="https://example.com" aria-invalid={Boolean(errors.websiteUrl)} />
								{errors.websiteUrl && <small role="alert">{errors.websiteUrl}</small>}
							</label>
							<label className="field">
								<span>Industry</span>
								<input value={draft.industry} onChange={(event) => updateDraft('industry', event.target.value)} placeholder="e.g. Financial services" />
							</label>
							<label className="field">
								<span>Country or operating region</span>
								<input value={draft.region} onChange={(event) => updateDraft('region', event.target.value)} placeholder="e.g. India" />
							</label>
							<label className="field field-full">
								<span>Short brand description</span>
								<textarea rows="3" value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="A brief description of your organization and its services" />
							</label>
							<label className="field field-full">
								<span>Official logo URL</span>
								<input type="url" value={draft.logoUrl} onChange={(event) => updateDraft('logoUrl', event.target.value)} placeholder="https://example.com/logo.png" aria-invalid={Boolean(errors.logoUrl)} />
								{errors.logoUrl && <small role="alert">{errors.logoUrl}</small>}
							</label>
						</div>
					</section>

					<section className="panel brand-section">
						<div className="brand-section-heading">
							<div><span className="section-index">02</span><h2>Official social accounts</h2></div>
							<p>Entries are user-provided references, not verified identities.</p>
						</div>
						{draft.socialAccounts.length === 0 ? (
							<div className="profile-empty-state">No official accounts added. You can save a profile without social accounts.</div>
						) : (
							<div className="asset-list">
								{draft.socialAccounts.map((account, index) => (
									<div className="asset-editor" key={account.id}>
										<div className="asset-editor-heading"><strong>Account {index + 1}</strong><button type="button" className="remove-button" onClick={() => removeAccount(account.id)} aria-label={`Remove social account ${index + 1}`}>Remove account</button></div>
										<div className="brand-fields">
											<label className="field"><span>Platform</span><select value={account.platform} onChange={(event) => updateAccount(account.id, 'platform', event.target.value)}>{SOCIAL_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
											<label className="field"><span>Official username or handle <b aria-hidden="true">*</b></span><input value={account.username} onChange={(event) => updateAccount(account.id, 'username', event.target.value)} placeholder="@yourbrand" aria-invalid={Boolean(errors[`account:${account.id}:username`])} />{errors[`account:${account.id}:username`] && <small role="alert">{errors[`account:${account.id}:username`]}</small>}</label>
											<label className="field"><span>Official profile URL</span><input type="url" value={account.profileUrl} onChange={(event) => updateAccount(account.id, 'profileUrl', event.target.value)} placeholder="https://instagram.com/yourbrand" aria-invalid={Boolean(errors[`account:${account.id}:profileUrl`])} />{errors[`account:${account.id}:profileUrl`] && <small role="alert">{errors[`account:${account.id}:profileUrl`]}</small>}</label>
											<label className="field"><span>Verification notes</span><input value={account.notes} onChange={(event) => updateAccount(account.id, 'notes', event.target.value)} placeholder="Context for your team" /></label>
										</div>
										<p className="asset-trust-note">Status: user-entered, not independently verified.</p>
									</div>
								))}
							</div>
						)}
						<button type="button" className="add-button" onClick={addAccount}><span aria-hidden="true">+</span> Add account</button>
					</section>

					<section className="panel brand-section">
						<div className="brand-section-heading">
							<div><span className="section-index">03</span><h2>Official mobile applications</h2></div>
							<p>A matching app name alone does not establish authenticity.</p>
						</div>
						{draft.officialApps.length === 0 ? (
							<div className="profile-empty-state">No official apps added. You can save a profile without mobile apps.</div>
						) : (
							<div className="asset-list">
								{draft.officialApps.map((app, index) => (
									<div className="asset-editor" key={app.id}>
										<div className="asset-editor-heading"><strong>App {index + 1}</strong><button type="button" className="remove-button" onClick={() => removeApp(app.id)} aria-label={`Remove official app ${index + 1}`}>Remove app</button></div>
										<div className="brand-fields">
											<label className="field"><span>App name <b aria-hidden="true">*</b></span><input value={app.appName} onChange={(event) => updateApp(app.id, 'appName', event.target.value)} aria-invalid={Boolean(errors[`app:${app.id}:appName`])} />{errors[`app:${app.id}:appName`] && <small role="alert">{errors[`app:${app.id}:appName`]}</small>}</label>
											<label className="field"><span>Platform</span><select value={app.platform} onChange={(event) => updateApp(app.id, 'platform', event.target.value)}>{APP_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
											<label className="field"><span>Package ID or bundle ID</span><input value={app.packageId} onChange={(event) => updateApp(app.id, 'packageId', event.target.value)} placeholder="com.example.app" aria-invalid={Boolean(errors[`app:${app.id}:packageId`])} />{errors[`app:${app.id}:packageId`] && <small role="alert">{errors[`app:${app.id}:packageId`]}</small>}</label>
											<label className="field"><span>Official developer or publisher</span><input value={app.publisher} onChange={(event) => updateApp(app.id, 'publisher', event.target.value)} /></label>
											<label className="field"><span>Official store listing URL</span><input type="url" value={app.storeUrl} onChange={(event) => updateApp(app.id, 'storeUrl', event.target.value)} aria-invalid={Boolean(errors[`app:${app.id}:storeUrl`])} />{errors[`app:${app.id}:storeUrl`] && <small role="alert">{errors[`app:${app.id}:storeUrl`]}</small>}</label>
											<label className="field"><span>Official app icon URL</span><input type="url" value={app.iconUrl} onChange={(event) => updateApp(app.id, 'iconUrl', event.target.value)} aria-invalid={Boolean(errors[`app:${app.id}:iconUrl`])} />{errors[`app:${app.id}:iconUrl`] && <small role="alert">{errors[`app:${app.id}:iconUrl`]}</small>}</label>
										</div>
										<p className="asset-trust-note">Status: user-entered, not independently verified.</p>
									</div>
								))}
							</div>
						)}
						<button type="button" className="add-button" onClick={addApp}><span aria-hidden="true">+</span> Add app</button>
					</section>

					<div className="brand-profile-actions">
						<button type="submit" className="primary-button" disabled={isLoading || isSaving}>{isSaving ? 'Saving…' : selectedBrandId ? 'Update brand profile' : 'Create brand profile'}</button>
						<button type="button" className="secondary-button" onClick={handleReset} disabled={isSaving}>Discard / reset</button>
					</div>
				</div>

				<aside className="panel brand-review" aria-label="Brand profile review">
					<div className="brand-review-heading"><p className="eyebrow">Review</p><h2>Profile summary</h2></div>
					<dl className="review-details">
						<ReviewItem label="Brand" value={draft.brandName || 'Not entered'} />
						<ReviewItem label="Website" value={draft.websiteUrl || 'Not provided'} />
						<ReviewItem label="Industry" value={draft.industry || 'Not provided'} />
						<ReviewItem label="Region" value={draft.region || 'Not provided'} />
						<ReviewItem label="Description" value={draft.description || 'Not provided'} />
						<ReviewItem label="Official logo" value={draft.logoUrl || 'Not provided'} />
					</dl>
					<div className="review-group">
						<h3>Social accounts <span>{draft.socialAccounts.length}</span></h3>
						{draft.socialAccounts.length ? <ul>{draft.socialAccounts.map((account) => <li key={account.id}><strong>{account.platform}: {normalizeUsername(account.username || '') || 'Handle required'}</strong><span>Profile: {account.profileUrl || 'Not provided'}</span><span>Notes: {account.notes || 'None'}</span></li>)}</ul> : <p>None added</p>}
					</div>
					<div className="review-group">
						<h3>Official apps <span>{draft.officialApps.length}</span></h3>
						{draft.officialApps.length ? <ul>{draft.officialApps.map((app) => <li key={app.id}><strong>{app.appName || 'App name required'}</strong><span>Platform: {app.platform}</span><span>Package or bundle ID: {app.packageId || 'Not provided'}</span><span>Publisher: {app.publisher || 'Not provided'}</span><span>Store listing: {app.storeUrl || 'Not provided'}</span><span>App icon: {app.iconUrl || 'Not provided'}</span></li>)}</ul> : <p>None added</p>}
					</div>
					<div className="review-caveat">Registered references are user-entered and are not independently verified.</div>
				</aside>
			</form>
		</div>
	)
}

function ReviewItem({ label, value }) {
	return <div className="review-item"><dt>{label}</dt><dd>{value}</dd></div>
}

export default BrandProfilePage