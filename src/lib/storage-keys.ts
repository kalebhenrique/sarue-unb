/**
 * Chaves padronizadas de localStorage do Saruê UnB.
 * Mantém compatibilidade transparente com chaves legadas (`unb_*`).
 */
export const STORAGE_KEYS = {
  ACADEMIC_PROFILE: 'sarue_academic_profile_v1',
  IRA_SCENARIO: 'sarue_ira_scenario_v1',
  LAST_SYNCED_AT: 'sarue_last_synced_at',
  EVALUATIONS_ENRICHED: 'sarue_persisted_enriched_evaluations_v1',
  EVALUATIONS_FILTER_BY_COURSE: 'sarue_evaluations_filter_by_course',
  THEME: 'sarue_theme',
  UI_ZOOM: 'sarue_ui_zoom',
  REDUCED_MOTION: 'sarue_reduced_motion',
  SOUND_EFFECTS: 'sarue_sound_effects_enabled',
  AUTOSTART: 'sarue_autostart_enabled',
  BACKGROUND_RUN: 'sarue_background_run_enabled',
  SYNC_ONLY_ON_WIFI: 'sarue_sync_only_on_wifi',
  HIDE_RU_DESKTOP_SIDEBAR: 'sarue_hide_ru_desktop_sidebar',
  NOTIFICATION_SETTINGS: 'sarue_notification_settings_v1',
  RU_NOTIFIED_MEALS: 'sarue_ru_notified_meals_v1',
  RU_SCHEDULED_NOTIF_IDS: 'sarue_ru_scheduled_notif_ids_v1',
  RU_SCHEDULED_MEAL_TIMES: 'sarue_ru_scheduled_meal_times_v1',
  GRADE_YEAR: 'unb_grade_year',
  GRADE_PERIOD: 'unb_grade_period',
  FLOWCHART_OPEN_SEMESTERS: 'unb_flowchart_open_semesters',
  ONBOARDING_EXPLORED: 'unb_onboarding_explored',
  VAULT_CLEARED: 'unb_vault_cleared_v1',
  DEMO_MODE: 'sarue_demo_mode_v1',
} as const;
