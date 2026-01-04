import { useState } from 'react'

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

const SetupPage = () => {
  const [nasPath, setNasPath] = useState('')
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleBrowse = async () => {
    const path = await window.toodoo.setup.browseFolder()
    if (path) {
      setNasPath(path)
      setValidationStatus('idle')
      setValidationError(null)
    }
  }

  const handleValidate = async () => {
    if (!nasPath.trim()) {
      setValidationError('Please enter a path')
      setValidationStatus('invalid')
      return
    }

    setValidationStatus('validating')
    setValidationError(null)

    try {
      const result = await window.toodoo.config.validatePath(nasPath)
      if (result.valid) {
        setValidationStatus('valid')
        setValidationError(null)
      } else {
        setValidationStatus('invalid')
        setValidationError(result.error || 'Path is not accessible')
      }
    } catch (err) {
      setValidationStatus('invalid')
      setValidationError('Failed to validate path')
    }
  }

  const handleSave = async () => {
    // If not validated yet, validate first
    if (validationStatus !== 'valid') {
      setValidationStatus('validating')
      setValidationError(null)

      try {
        const result = await window.toodoo.config.validatePath(nasPath)
        if (!result.valid) {
          setValidationStatus('invalid')
          setValidationError(result.error || 'Path is not accessible')
          return
        }
        setValidationStatus('valid')
      } catch {
        setValidationStatus('invalid')
        setValidationError('Failed to validate path')
        return
      }
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const result = await window.toodoo.config.setNasPath(nasPath)
      if (result.success) {
        // Notify main process that setup is complete
        await window.toodoo.setup.complete()
      } else {
        setSaveError(result.error || 'Failed to save configuration')
      }
    } catch (err) {
      setSaveError('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const getValidationIcon = () => {
    switch (validationStatus) {
      case 'validating':
        return <span className="validation-icon validating">...</span>
      case 'valid':
        return <span className="validation-icon valid">✓</span>
      case 'invalid':
        return <span className="validation-icon invalid">✗</span>
      default:
        return null
    }
  }

  return (
    <div className="setup-container">
      <div className="setup-card">
        <h1 className="setup-title">TooDoo Setup</h1>

        <p className="setup-description">
          Enter the path to your NAS folder where TooDoo data will be stored.
          This can be a UNC path (e.g., \\server\share\toodoo) or a mapped drive.
        </p>

        <div className="setup-form">
          <div className="input-group">
            <label htmlFor="nas-path">NAS Folder Path</label>
            <div className="input-row">
              <input
                id="nas-path"
                type="text"
                value={nasPath}
                onChange={(e) => {
                  setNasPath(e.target.value)
                  setValidationStatus('idle')
                  setValidationError(null)
                }}
                placeholder="\\server\share\toodoo"
                className="path-input"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="browse-button"
              >
                Browse
              </button>
            </div>
          </div>

          <div className="validation-section">
            <button
              type="button"
              onClick={handleValidate}
              disabled={!nasPath.trim() || validationStatus === 'validating'}
              className="validate-button"
            >
              {validationStatus === 'validating' ? 'Validating...' : 'Validate Path'}
            </button>
            {getValidationIcon()}
            {validationStatus === 'valid' && (
              <span className="validation-message success">Path is accessible</span>
            )}
            {validationError && (
              <span className="validation-message error">{validationError}</span>
            )}
          </div>

          {saveError && (
            <div className="error-message">{saveError}</div>
          )}

          <div className="action-buttons">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || validationStatus === 'validating'}
              className="save-button"
            >
              {isSaving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>

        <p className="setup-hint">
          Tip: You can also set the TOODOO_NAS_PATH environment variable to skip this setup.
        </p>
      </div>
    </div>
  )
}

export default SetupPage
