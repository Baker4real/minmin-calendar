/**
 * Record-edit sessions own form state, drafts and mutation coordination.
 * Failure presentation belongs to roomAccessOutcome and is executed by wxPrompts.
 */
const cloud = require('./cloud')
const util = require('./util')
const cycle = require('./cycle')
const periodCoverage = require('./periodCoverage')
const recordDraft = require('./recordDraft')
const recordEditRoute = require('./recordEditRoute')
const recordFieldErrors = require('./recordFieldErrors')
const recordPageSync = require('./recordPageSync')
const roomAccessOutcome = require('./roomAccessOutcome')
const wxPrompts = require('./wxPrompts')

const EDIT_KINDS = {
  period: {
    collection: 'periods',
    draftFields: ['startDate', 'endDate', 'status', 'note', 'flow', 'symptoms'],
    fieldOrder: ['startDate', 'endDate'],
    parseRoute: recordEditRoute.parsePeriodEditOptions,
    normalizeForm(form) {
      const status = periodCoverage.getPeriodStatus(form)
      return { ...form, status, endDate: status === 'known-end' ? form.endDate : '' }
    },
    changeField(state, field, value, today) {
      const update = { [field]: value }
      if (field === 'status') {
        if (!cycle.isPeriodStatus(value) || value === state.status) return null
        // 只有完成进行中记录才把空结束日默认为今天；其他切换保持为空。
        if (value === 'known-end' && !state.endDate && state.status === 'ongoing'
          && (!state.startDate || today >= state.startDate)) update.endDate = today
      } else if (field === 'startDate' && state.status === 'known-end' && state.endDate && value > state.endDate) {
        update.endDate = value
      } else if (field === 'flow') {
        update.flow = state.flow === value ? '' : value
      } else if (field === 'symptoms') {
        update.symptoms = state.symptoms.includes(value)
          ? state.symptoms.filter(symptom => symptom !== value)
          : [...state.symptoms, value]
      }
      return update
    },
    validate({ startDate, endDate, status }, today) {
      const errors = {}
      if (!startDate) errors.startDate = '请选择开始日期'
      else if (!util.isValidDateString(startDate)) errors.startDate = '请选择有效的开始日期'
      else if (startDate > today) errors.startDate = '开始日期不能晚于今天'
      if (status === 'known-end') {
        if (!endDate) errors.endDate = '请选择结束日期；还没结束可以选「进行中」'
        else if (!util.isValidDateString(endDate)) errors.endDate = '请选择有效的结束日期'
        else if (!errors.startDate && startDate > endDate) errors.endDate = '结束日期不能早于开始'
        else if (endDate > today) errors.endDate = '结束日期不能晚于今天'
      }
      return Object.keys(errors).length ? errors : null
    },
    buildPayload: cycle.buildPeriodPayload,
    describeForm(state, today, periods) {
      const summary = cycle.describeKnownPeriodLength({
        startDate: state.startDate,
        endDate: state.status === 'known-end' ? state.endDate : '',
        periods
      })
      return {
        startDateLabel: util.formatDisplayDate(state.startDate, { today }),
        endDateLabel: util.formatDisplayDate(state.endDate, { today }),
        flowOptions: cycle.FLOW_OPTIONS,
        statusOptions: cycle.PERIOD_STATUS_OPTIONS,
        symptomGroups: cycle.buildSymptomOptions(state.symptoms),
        statusHint: cycle.periodStatusHint(state.status),
        periodDayCountText: summary.text,
        periodLengthHint: summary.hint
      }
    },
    overlapOwner: periodCoverage.getPeriodOnDate,
    successTitle: '保存成功',
    mergedTitle: '已打开进行中的经期',
    mergedContent: '房间里已有一条进行中的经期，已为你打开它',
    confirmContent: '删除后你们两人的日历都会移除这条经期记录，且不可恢复'
  },
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
  let draftKey = recordDraft.buildDraftKey({ collection: config.collection, id: routeState.id })
  let baseline = recordDraft.pickDraftFields(routeState, config.draftFields)
  const storedDraft = recordDraft.readDraft(storage, draftKey)
  let draftDiscarded = false
  let deleteConfirming = false
  let savePreparing = false
  let periodHistory = []
  let state = {
    ...routeState,
    ...(storedDraft ? recordDraft.pickDraftFields(storedDraft, config.draftFields) : {}),
    saving: false,
    deleting: false,
    submitted: false,
    draftRestored: !!storedDraft,
    fieldErrors: {}
  }
  if (config.normalizeForm) state = config.normalizeForm(state)

  function publish(update = {}) {
    state = { ...state, ...update }
    render({ ...state, ...config.describeForm(state, today(), periodHistory) })
  }

  function busy() {
    return savePreparing || state.saving || state.deleting || state.submitted
  }

  function persistDraft() {
    if (draftDiscarded) return
    recordDraft.syncDraft(storage, draftKey, recordDraft.pickDraftFields(state, config.draftFields), baseline)
  }

  function discardDraft() {
    draftDiscarded = true
    recordDraft.clearDraft(storage, draftKey)
  }

  async function loadPeriodHistory() {
    try {
      const outcome = await cloud.createRoomDataClient().list(config.collection)
      if (outcome.kind === 'success') periodHistory = outcome.data
    } catch (error) {
      // 读取失败保留已有历史；时长仍可使用领域默认值。
    }
    publish()
  }

  async function resolveNewPeriodOverlap() {
    if (state.isEdit || !config.overlapOwner) return 'save'
    await loadPeriodHistory()
    const owner = config.overlapOwner(periodHistory, state.startDate, today())
    if (!owner) return 'save'
    const editExisting = await new Promise(resolve => {
      wxPrompts.modal({
        title: '这一天已有经期',
        content: '开始日已经落在一条已有经期里。',
        confirmText: '编辑那条',
        cancelText: '仍然新建',
        success: response => resolve(!!(response && response.confirm)),
        fail: () => {
          wxPrompts.present({ mode: 'toast', content: '这次没有完成，请重试' })
          resolve(null)
        }
      })
    })
    if (editExisting === null) return { kind: 'cancelled' }
    if (!editExisting) return 'save'
    discardDraft()
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(owner.record) })
    return { kind: 'edit-existing' }
  }

  function applyReopenedRecord(record) {
    const form = config.normalizeForm({
      id: record._id,
      startDate: record.startDate || '',
      endDate: record.endDate || '',
      status: record.status,
      note: record.note || '',
      flow: record.flow || '',
      symptoms: Array.isArray(record.symptoms) ? record.symptoms : [],
      isEdit: true
    })
    // 清掉被丢弃的新建草稿，再以真实记录的字段重建身份与基线。
    discardDraft()
    draftKey = recordDraft.buildDraftKey({ collection: config.collection, id: form.id })
    baseline = recordDraft.pickDraftFields(form, config.draftFields)
    recordDraft.clearDraft(storage, draftKey)
    draftDiscarded = false
    publish({ ...form, draftRestored: false, fieldErrors: {} })
  }

  publish()
  if (storedDraft) {
    wxPrompts.present({ mode: 'toast', content: '已恢复上次未完成的输入' })
  }
  if (config.overlapOwner) loadPeriodHistory()

  return {
    changeField(field, value) {
      if (state.saving || !config.draftFields.includes(field)) return
      const update = config.changeField ? config.changeField(state, field, value, today()) : { [field]: value }
      if (!update) return
      const next = { ...state, ...update }
      publish({
        ...update,
        fieldErrors: recordFieldErrors.retainShownFieldErrors(state.fieldErrors, config.validate(next, today()))
      })
    },

    async save() {
      if (busy() || deleteConfirming) return
      savePreparing = true
      publish({ saving: true })
      try {
        const overlap = await resolveNewPeriodOverlap()
        if (overlap !== 'save') return overlap
        const fieldErrors = config.validate(state, today())
        if (fieldErrors) {
          publish({ fieldErrors })
          recordFieldErrors.scrollToFirstFieldError(fieldErrors, config.fieldOrder)
          return { kind: 'validation', fieldErrors }
        }
        const { id, isEdit } = state
        const payload = config.buildPayload(state)
        const client = cloud.createRoomDataClient()
        const outcome = await runCommand({
          wxApi: wx,
          render: publish,
          action: () => isEdit ? client.update(config.collection, id, payload) : client.add(config.collection, payload),
          refetch: () => client.list(config.collection),
          reconcile: { id: isEdit ? id : '', fields: payload },
          operation: 'save',
          successTitle: config.successTitle,
          successIcon: config.successIcon,
          mergedTitle: config.mergedTitle,
          mergedContent: config.mergedContent,
          successDelay: 1000
        })
        if (outcome.kind === 'merged') {
          const record = recordPageSync.getSavedRecord(outcome)
          if (record) applyReopenedRecord(record)
        } else if (outcome.kind === 'success') {
          discardDraft()
        }
        recordPageSync.notifyRecordSaved({ collection: config.collection, isEdit, outcome })
        return outcome
      } finally {
        savePreparing = false
        if (state.saving) publish({ saving: false })
      }
    },

    async delete() {
      if (busy() || deleteConfirming) return
      deleteConfirming = true
      try {
        const confirmed = await confirmRecordDelete(config.confirmContent)
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

function confirmRecordDelete(content) {
  // 确认之前不进入删除忙碌态；缺少 API 或失败由 adapter 回落为取消。
  return new Promise(resolve => {
    wxPrompts.modal({
      title: '确认删除',
      confirmText: '删除',
      confirmColor: '#F97373',
      content,
      success: result => resolve(!!(result && result.confirm))
    })
  })
}

async function runCommand(options) {
  const {
    render,
    wxApi,
    action,
    loadingKey = 'saving',
    successTitle,
    successIcon,
    mergedTitle,
    mergedContent,
    successDelay,
    operation,
    refetch,
    reconcile
  } = options

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
    // 不显示保存成功、不排返回，用说明 modal 告知后由会话切换记录身份
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
    setTimeout(() => wxApi.navigateBack(), successDelay)
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
      setTimeout(() => wxApi.navigateBack(), successDelay)
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
    navigateToBind: createNavigateToBind(wxApi)
  })
}

function handleFailureOutcome({ outcome, operation, wxApi, navigateToBind }) {
  return wxPrompts.present(roomAccessOutcome.presentRoomAccessFailure(outcome, operation), {
    wx: wxApi,
    navigateToBind
  })
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

function createNavigateToBind(wxApi) {
  if (wxApi && typeof wxApi.navigateTo === 'function') {
    return () => wxApi.navigateTo({ url: '/pages/bind/bind' })
  }
  return () => {}
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
  openRecordEditSession
}
