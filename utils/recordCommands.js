/**
 * Record-edit sessions own form state, drafts and mutation coordination.
 * Period editing still uses the legacy command adapters until its migration.
 * Failure presentation belongs to roomAccessOutcome and is executed by wxPrompts.
 */
const cloud = require('./cloud')
const util = require('./util')
const recordDraft = require('./recordDraft')
const recordEditRoute = require('./recordEditRoute')
const recordFieldErrors = require('./recordFieldErrors')
const recordPageSync = require('./recordPageSync')
const roomAccessOutcome = require('./roomAccessOutcome')
const wxPrompts = require('./wxPrompts')

const EDIT_KINDS = {
  memory: {
    collection: 'memories',
    draftFields: ['date', 'note'],
    fieldOrder: ['date'],
    parseRoute: recordEditRoute.parseMemoryEditOptions,
    validate({ date }, today) {
      if (!date) return { date: '请选择日期' }
      if (!util.isValidDateString(date)) return { date: '请选择有效日期' }
      if (date > today) return { date: '日期不能晚于今天' }
      return null
    },
    buildPayload: ({ date, note }) => ({ date, note }),
    describeForm: ({ date }, today) => ({ dateLabel: util.formatDisplayDate(date, { today }) }),
    successTitle: '已存进你们的欢乐时光',
    successIcon: 'none',
    confirmContent: '删除后你们两人的日历都会移除这条欢乐时光，且不可恢复'
  }
}

// The render callback is the only form output. No Page or page.data enters a session.
function openRecordEditSession({ kind, route, render }) {
  const config = EDIT_KINDS[kind]
  if (!config) throw new Error(`Unsupported record kind: ${kind}`)
  const today = () => util.formatDate(new Date())
  const routeState = config.parseRoute(route, { today: today() })
  const storage = recordDraft.createWxDraftStorage(wx)
  const draftKey = recordDraft.buildDraftKey({ collection: config.collection, id: routeState.id })
  const baseline = recordDraft.pickDraftFields(routeState, config.draftFields)
  const storedDraft = recordDraft.readDraft(storage, draftKey)
  let draftDiscarded = false
  let deleteConfirming = false
  let state = {
    ...routeState,
    ...(storedDraft ? recordDraft.pickDraftFields(storedDraft, config.draftFields) : {}),
    saving: false,
    deleting: false,
    submitted: false,
    draftRestored: !!storedDraft,
    fieldErrors: {}
  }

  function publish(update = {}) {
    state = { ...state, ...update }
    render({ ...state, ...config.describeForm(state, today()) })
  }

  function busy() {
    return state.saving || state.deleting || state.submitted
  }

  function persistDraft() {
    if (draftDiscarded) return
    recordDraft.syncDraft(storage, draftKey, recordDraft.pickDraftFields(state, config.draftFields), baseline)
  }

  function discardDraft() {
    draftDiscarded = true
    recordDraft.clearDraft(storage, draftKey)
  }

  publish()
  if (storedDraft) {
    wxPrompts.present({ mode: 'toast', content: '已恢复上次未完成的输入' })
  }

  return {
    changeField(field, value) {
      if (state.saving || !config.draftFields.includes(field)) return
      const next = { ...state, [field]: value }
      publish({
        [field]: value,
        fieldErrors: recordFieldErrors.retainShownFieldErrors(state.fieldErrors, config.validate(next, today()))
      })
    },

    async save() {
      if (busy()) return
      const { id, isEdit } = state
      const payload = config.buildPayload(state)
      const client = cloud.createRoomDataClient()
      const outcome = await runCommand({
        wxApi: wx,
        render: publish,
        action: () => isEdit ? client.update(config.collection, id, payload) : client.add(config.collection, payload),
        validate: () => config.validate(state, today()),
        refetch: () => client.list(config.collection),
        reconcile: { id: isEdit ? id : '', fields: payload },
        operation: 'save',
        successTitle: config.successTitle,
        successIcon: config.successIcon,
        successDelay: 1000
      })
      if (outcome.kind === 'validation') {
        publish({ fieldErrors: outcome.fieldErrors })
        recordFieldErrors.scrollToFirstFieldError(outcome.fieldErrors, config.fieldOrder)
      } else if (outcome.kind === 'success') {
        discardDraft()
        recordPageSync.notifyRecordSaved({ collection: config.collection, isEdit, outcome })
      }
      return outcome
    },

    async delete() {
      if (busy() || deleteConfirming) return
      deleteConfirming = true
      try {
        const confirmed = await confirmRecordDelete({ wxApi: wx, confirmContent: config.confirmContent })
        if (!confirmed) return { kind: 'cancelled' }
        const client = cloud.createRoomDataClient()
        const outcome = await runCommand({
          wxApi: wx,
          render: publish,
          action: () => client.remove(config.collection, state.id),
          loadingKey: 'deleting',
          successTitle: '已删除',
          operation: 'delete'
        })
        if (outcome.kind === 'success') {
          discardDraft()
          recordPageSync.notifyRecordDeleted({ collection: config.collection, id: state.id })
        }
        return outcome
      } finally {
        deleteConfirming = false
      }
    },

    onHide: persistDraft,
    onUnload: persistDraft
  }
}

function runRecordSave(options) {
  const opts = options || {}
  const wxApi = resolveWxApi(opts)
  const {
    page,
    timer = createDefaultTimer(),
    action,
    validate,
    loadingKey = 'saving',
    successTitle = '保存成功',
    successIcon,
    successDelay = 1000
  } = opts
  const navigateBack = typeof opts.navigateBack === 'function'
    ? opts.navigateBack
    : createNavigateBack(wxApi)
  const navigateToBind = typeof opts.navigateToBind === 'function'
    ? opts.navigateToBind
    : createNavigateToBind(wxApi)

  return runCommand({
    render: update => updatePage(page, update),
    wxApi,
    timer,
    action,
    validate,
    loadingKey,
    successTitle,
    successIcon,
    mergedTitle: opts.mergedTitle,
    mergedContent: opts.mergedContent,
    navigateBack,
    navigateToBind,
    successDelay,
    operation: 'save',
    refetch: opts.refetch,
    reconcile: opts.reconcile
  })
}

function runRecordDelete(options) {
  const opts = options || {}
  const wxApi = resolveWxApi(opts)
  return confirmRecordDelete({ ...opts, wxApi }).then(confirmed => {
    if (!confirmed) return { kind: 'cancelled' }
    return runCommand({
      ...opts,
      wxApi,
      render: update => updatePage(opts.page, update),
      loadingKey: opts.loadingKey || 'deleting',
      validate: null,
      operation: 'delete'
    })
  })
}

function confirmRecordDelete({ wxApi, confirmTitle = '确认删除', confirmContent, confirmText = '删除', confirmColor = '#F97373' }) {
  // 确认之前不进入删除忙碌态；缺少 API 或失败由 adapter 回落为取消。
  return new Promise(resolve => {
    wxPrompts.modal({
      title: confirmTitle,
      confirmText,
      confirmColor,
      ...(confirmContent ? { content: confirmContent } : {}),
      success: result => resolve(!!(result && result.confirm))
    }, wxApi)
  })
}

async function runRecordListLoad(options) {
  const opts = options || {}
  const wxApi = resolveWxApi(opts)
  const {
    page,
    action,
    mapRecords,
    onLoaded,
    itemsKey,
    loadingKey = 'loading',
    loadFailedKey = 'loadFailed'
  } = opts
  const navigateToBind = typeof opts.navigateToBind === 'function'
    ? opts.navigateToBind
    : createNavigateToBind(wxApi)

  updatePage(page, { [loadingKey]: true })

  let outcome
  try {
    outcome = await action()
  } catch (error) {
    outcome = {
      kind: 'retryable-failure',
      message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
    }
  }

  if (outcome.kind === 'success') {
    const records = Array.isArray(outcome.data) ? outcome.data : []
    const viewData = typeof mapRecords === 'function' ? mapRecords(records) : records
    updatePage(page, { [itemsKey]: viewData, [loadFailedKey]: false })
    if (typeof onLoaded === 'function') {
      onLoaded(records)
    }
    updatePage(page, { [loadingKey]: false })
    return outcome
  }

  updatePage(page, { [loadingKey]: false })
  const result = await handleFailureOutcome({
    outcome,
    wxApi,
    operation: 'list',
    retryAction: () => runRecordListLoad(options),
    navigateToBind
  })
  if (!result || result.kind !== 'success') {
    updatePage(page, { [loadFailedKey]: true })
  }
  return result
}

async function runCommand(options) {
  const {
    render,
    wxApi,
    timer = createDefaultTimer(),
    action,
    validate,
    loadingKey = 'saving',
    successTitle,
    successIcon,
    mergedTitle = '已合并到已有记录',
    mergedContent = '房间里已有一条进行中的记录，已为你打开它',
    navigateBack = createNavigateBack(wxApi),
    navigateToBind = createNavigateToBind(wxApi),
    successDelay,
    operation,
    refetch,
    reconcile
  } = options

  const validation = readValidation(validate)
  if (validation) {
    // 能定位到字段的错误交回页面显示在字段旁；只有无法定位的整体错误才用瞬时 toast
    if (!validation.fieldErrors) {
      wxPrompts.present({ mode: 'toast', content: validation.message }, { wx: wxApi })
    }
    return validation
  }

  render({ [loadingKey]: true })

  let outcome
  try {
    outcome = await action()
  } catch (error) {
    outcome = {
      kind: 'retryable-failure',
      message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
    }
  }

  if (outcome.kind === 'success') {
    // 云端重开了已有进行中记录并丢弃本次表单：归为「合并到已有进行中记录」，
    // 不显示保存成功、不排返回，用说明 modal 告知后再把结果交给页面
    if (outcome.result && outcome.result.reopened === true) {
      render({ [loadingKey]: false })
      return wxPrompts.present({ mode: 'acknowledge', title: mergedTitle, content: mergedContent }, {
        wx: wxApi,
        fallback: { kind: 'merged', result: outcome.result }
      })
    }
    safeShowToast(wxApi, {
      title: successTitle,
      ...(successIcon ? { icon: successIcon } : {})
    })
    timer.setTimeout(() => {
      navigateBack()
    }, successDelay)
    // 已提交、等待返回：清掉「保存中/删除中」，但保持不可点，直到 navigateBack
    render({ [loadingKey]: false, submitted: true })
    return outcome
  }

  if (outcome.kind === 'retryable-failure' && operation === 'save' && typeof refetch === 'function') {
    if (outcome.message) roomAccessOutcome.presentUserFailure(outcome.message)
    const reconciled = await confirmUnconfirmedSave({
      refetch,
      reconcile
    })
    if (reconciled.refetchFailed) {
      const refetchMessage = reconciled.error && reconciled.error.message
      if (refetchMessage) roomAccessOutcome.presentUserFailure(refetchMessage)
    }
    if (reconciled.confirmed && reconciled.record) {
      safeShowToast(wxApi, { title: '已保存' })
      timer.setTimeout(() => {
        navigateBack()
      }, successDelay)
      render({ [loadingKey]: false, submitted: true })
      return { kind: 'success', result: { record: reconciled.record } }
    }
    if (reconciled.confirmed) {
      outcome = { kind: 'save-not-applied' }
    }
  }

  render({ [loadingKey]: false })
  return handleFailureOutcome({
    outcome,
    wxApi,
    operation,
    retryAction: () => runCommand(options),
    navigateToBind
  })
}

function handleFailureOutcome({ outcome, operation, wxApi, retryAction, navigateToBind }) {
  return wxPrompts.present(roomAccessOutcome.presentRoomAccessFailure(outcome, operation), {
    wx: wxApi,
    retry: retryAction,
    navigateToBind
  })
}

// validate 返回空值表示通过；字符串是无法定位到字段的整体错误；
// 对象是「字段 → 一句人话」，空句的字段不算出错，全部为空等于通过。
function readValidation(validate) {
  const result = typeof validate === 'function' ? validate() : ''
  if (!result) return null
  if (typeof result === 'string') return { kind: 'validation', message: result }
  const fields = Object.keys(result).filter(field => result[field])
  if (fields.length === 0) return null
  const fieldErrors = {}
  fields.forEach(field => {
    fieldErrors[field] = result[field]
  })
  return { kind: 'validation', message: fieldErrors[fields[0]], fieldErrors }
}

async function confirmUnconfirmedSave({ refetch, reconcile }) {
  let listed
  try {
    listed = await refetch()
  } catch (error) {
    return { confirmed: false, record: null, refetchFailed: true, error }
  }
  if (!listed || listed.kind !== 'success') {
    return { confirmed: false, record: null, refetchFailed: true, error: listed }
  }
  return {
    confirmed: true,
    record: findReconciledRecord(listed.data, reconcile),
    refetchFailed: false
  }
}

function findReconciledRecord(records, reconcile) {
  const spec = reconcile && typeof reconcile === 'object' ? reconcile : {}
  const fields = spec.fields && typeof spec.fields === 'object' ? spec.fields : {}
  const keys = Object.keys(fields)
  if (keys.length === 0) return null
  const list = Array.isArray(records) ? records : []
  if (spec.id) {
    const record = list.find(item => item && String(item._id) === String(spec.id))
    if (!record || !fieldsMatch(record, fields)) return null
    return record
  }
  return list.find(item => item && fieldsMatch(item, fields)) || null
}

function fieldsMatch(record, fields) {
  return Object.keys(fields).every(key => sameFieldValue(record[key], fields[key]))
}

function sameFieldValue(actual, expected) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const left = (Array.isArray(actual) ? actual : []).map(value => String(value)).sort()
    const right = (Array.isArray(expected) ? expected : []).map(value => String(value)).sort()
    return left.length === right.length && left.every((value, index) => value === right[index])
  }
  return String(actual == null ? '' : actual) === String(expected == null ? '' : expected)
}

function updatePage(page, update) {
  if (page && typeof page.setData === 'function') {
    page.setData(update)
  }
}

function createDefaultTimer() {
  return {
    setTimeout(handler, delay) {
      return setTimeout(handler, delay)
    }
  }
}

function createNavigateBack(wxApi) {
  if (wxApi && typeof wxApi.navigateBack === 'function') {
    return () => wxApi.navigateBack()
  }
  return () => {}
}

function createNavigateToBind(wxApi) {
  if (wxApi && typeof wxApi.navigateTo === 'function') {
    return () => wxApi.navigateTo({ url: '/pages/bind/bind' })
  }
  return () => {}
}

function getWx() {
  if (typeof wx === 'undefined') {
    throw new Error('wx is unavailable outside the WeChat runtime')
  }
  return wx
}

function resolveWxApi(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'wx')) {
    return options.wx
  }
  return getWx()
}

function safeShowToast(wxApi, options) {
  if (wxApi && typeof wxApi.showToast === 'function') {
    wxApi.showToast(options)
  }
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  openRecordEditSession,
  runRecordSave,
  runRecordDelete,
  runRecordListLoad
}
