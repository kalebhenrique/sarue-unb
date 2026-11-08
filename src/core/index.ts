// Entities
export * from './domain/entities/feed-item';
export * from './domain/entities/credential';
export * from './domain/entities/course';
export * from './domain/entities/grade';
export * from './domain/entities/academic-profile';
export * from './domain/entities/ira-scenario';
export * from './domain/entities/academic-calendar';
export * from './domain/entities/deadline-notification';
export * from './domain/entities/professor-evaluation';
export * from './domain/entities/user-calendar-event';
// Domain Utils
export * from './domain/utils/grade-acronym';
export * from './domain/utils/course-shift';
export * from './domain/utils/absence-calculator';
export * from './domain/utils/grade-formula-calculator';
export * from './domain/utils/semester';
export * from './domain/utils/profanity-filter';

// Interfaces / Ports
export * from './domain/interfaces/credentials-repo.interface';
export * from './domain/interfaces/sync-repo.interface';
export * from './domain/interfaces/feed-repo.interface';
export * from './domain/interfaces/deadline-notification-repo.interface';
export * from './domain/interfaces/os-notifier.interface';
export * from './domain/interfaces/grade-repo.interface';
export * from './domain/interfaces/academic-profile-repo.interface';
export * from './domain/interfaces/ira-scenario-repo.interface';
export * from './domain/interfaces/professor-evaluation-repo.interface';
export * from './domain/interfaces/user-events-repo.interface';

// Use Cases
export * from './application/save-credentials.use-case';
export * from './application/get-credentials.use-case';
export * from './application/sync-platforms.use-case';
export * from './application/get-feed.use-case';
export * from './application/evaluate-deadline-notifications.use-case';
export * from './application/get-courses.use-case';
export * from './application/get-departments.use-case';
export * from './application/get-semesters.use-case';
export * from './application/scrape-classes.use-case';
export * from './application/solve-schedule.use-case';
export * from './application/manage-grade.use-case';
export * from './application/manage-academic-profile.use-case';
export * from './application/get-flowchart.use-case';
export * from './application/parse-historico.use-case';
export * from './application/calculate-ira.use-case';
export * from './application/build-ira-scenario.use-case';
export * from './application/manage-ira-scenario.use-case';
export * from './application/get-academic-calendar.use-case';
export * from './application/get-professor-evaluations.use-case';
export * from './application/manage-user-events.use-case';
export * from './application/get-unified-calendar-events.use-case';

// DI Container
// Nota: repositórios concretos (adapters) não são exportados aqui de propósito.
// O único lugar que os conhece é o container.
export * from './container';

// Seeds
export * from './seeds/academic-profile.seed';

