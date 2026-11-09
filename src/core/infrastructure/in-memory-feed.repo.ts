import type { FeedItem } from '../domain/entities/feed-item';
import type { Course, CourseAssociation } from '../domain/entities/course';
import type { IFeedRepository, FeedFilterOptions } from '../domain/interfaces/feed-repo.interface';

export class InMemoryFeedRepository implements IFeedRepository {
  private items: Map<string, FeedItem> = new Map();
  private courses: Map<string, Course> = new Map();
  private associations: Map<string, CourseAssociation> = new Map();

  async getItems(filters?: FeedFilterOptions): Promise<FeedItem[]> {
    let result = Array.from(this.items.values());

    // Filtragem padrão de itens arquivados
    if (filters?.onlyArchived) {
      result = result.filter((item) => Boolean(item.isArchived));
    } else if (!filters?.includeArchived) {
      result = result.filter((item) => !item.isArchived);
    }

    if (filters) {
      if (filters.platform && filters.platform !== 'all') {
        result = result.filter((item) => item.platform === filters.platform);
      }

      if (filters.itemType && filters.itemType !== 'all') {
        result = result.filter((item) => item.itemType === filters.itemType);
      }

      if (filters.courseCode) {
        result = result.filter((item) => item.courseCode === filters.courseCode);
      }

      if (filters.courseCodes && filters.courseCodes.length > 0) {
        result = result.filter((item) => item.courseCode && filters.courseCodes!.includes(item.courseCode));
      }

      if (filters.courseNames && filters.courseNames.length > 0) {
        result = result.filter((item) => filters.courseNames!.includes(item.courseName));
      }

      if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
        const query = filters.searchQuery.toLowerCase();
        result = result.filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            item.content.toLowerCase().includes(query) ||
            item.courseName.toLowerCase().includes(query)
        );
      }
    }

    return result;
  }

  async saveItems(newItems: FeedItem[]): Promise<void> {
    for (const item of newItems) {
      const existing = this.items.get(item.id);
      this.items.set(item.id, {
        ...item,
        isCompleted: Boolean(existing?.isCompleted || item.isCompleted),
        isArchived: Boolean(existing?.isArchived || item.isArchived),
      });
    }
  }

  async markItemAsCompleted(id: string, isCompleted: boolean): Promise<void> {
    const existing = this.items.get(id);
    if (existing) {
      this.items.set(id, { ...existing, isCompleted });
    }
  }

  async archiveItem(id: string, isArchived: boolean): Promise<void> {
    const existing = this.items.get(id);
    if (existing) {
      this.items.set(id, { ...existing, isArchived });
    }
  }

  async getCourses(): Promise<Course[]> {
    return Array.from(this.courses.values());
  }

  async saveCourses(newCourses: Course[]): Promise<void> {
    for (const course of newCourses) {
      this.courses.set(course.id, { ...course });
    }
  }

  async getAssociations(): Promise<CourseAssociation[]> {
    return Array.from(this.associations.values());
  }

  async saveAssociation(association: CourseAssociation): Promise<void> {
    this.associations.set(association.aprenderCourseId, {
      ...association,
      updatedAt: association.updatedAt || new Date().toISOString(),
    });
  }

  async clear(): Promise<void> {
    this.items.clear();
    this.courses.clear();
    this.associations.clear();
  }
}

