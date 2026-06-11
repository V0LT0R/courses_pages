import { ensureSupabaseConfigured, supabase, withTimeout } from './supabase';
import { sendCertificateData } from './certificateApi';

const COURSE_BUCKET = 'course-files';
const CACHE_TTL = 60_000;
const courseCache = new Map();

function getCached(key) {
  const cached = courseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.time > CACHE_TTL) {
    courseCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCached(key, value) {
  courseCache.set(key, { value, time: Date.now() });
  return value;
}

function clearCourseCache() {
  courseCache.clear();
}


export function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `course-${Date.now()}`;
}

export function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.full_name,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    organization: row.organization || '',
    phone: row.phone || '',
    createdAt: row.created_at,
  };
}

export function mapCourse(row, currentUser = null) {
  if (!row) return null;
  const author = row.author || row.profiles || null;
  const canEdit = Boolean(
    currentUser?.role === 'admin' ||
    (currentUser?.role === 'manager' && row.created_by === currentUser.id)
  );

  return {
    uuid: row.id,
    id: row.slug,
    slug: row.slug,
    title: row.title,
    category: row.category,
    date: row.date_text,
    duration: row.duration,
    format: row.format,
    location: row.location,
    image: row.image_url,
    shortDescription: row.short_description,
    description: row.description,
    outcomes: row.outcomes || [],
    lecturer: {
      name: row.lecturer_name || '',
      role: row.lecturer_role || '',
      bio: row.lecturer_bio || '',
      photo: row.lecturer_photo || '',
    },
    certificate: row.certificate,
    rating: Number(row.rating || 5),
    createdBy: row.created_by,
    author: author ? {
      id: author.id,
      name: author.full_name,
      email: author.email,
      role: author.role,
    } : null,
    canEdit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSection(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description || '',
    position: row.position,
    blocks: [],
  };
}

export function mapBlock(row) {
  return {
    id: row.id,
    sectionId: row.section_id,
    type: row.type,
    title: row.title || '',
    content: row.content || '',
    filePath: row.file_path || '',
    position: row.position,
  };
}

function coursePayloadToRow(payload, userId) {
  return {
    slug: normalizeSlug(payload.slug || payload.title),
    title: payload.title,
    category: payload.category,
    date_text: payload.date,
    duration: payload.duration,
    format: payload.format,
    location: payload.location,
    image_url: payload.image,
    short_description: payload.shortDescription,
    description: payload.description,
    outcomes: payload.outcomes || [],
    lecturer_name: payload.lecturer?.name || '',
    lecturer_role: payload.lecturer?.role || '',
    lecturer_bio: payload.lecturer?.bio || '',
    lecturer_photo: payload.lecturer?.photo || '',
    certificate: Boolean(payload.certificate),
    rating: Number(payload.rating || 5),
    ...(userId ? { created_by: userId } : {}),
  };
}

export async function isEmailTaken(email) {
  ensureSupabaseConfigured();
  const { data, error } = await withTimeout(
    supabase.rpc('is_email_taken', { check_email: String(email || '').toLowerCase().trim() }),
    'Supabase не отвечает при проверке email. Проверьте подключение и schema.sql.'
  );
  if (error) throw error;
  return Boolean(data);
}

export async function getCurrentProfile() {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    'Supabase Auth не отвечает при получении пользователя.'
  );
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(),
    'Supabase не отвечает при загрузке профиля. Проверьте таблицу profiles и RLS policies.'
  );

  if (error) throw error;
  return mapProfile(data);
}

export async function updateMyProfile({ fullName, organization, phone }) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Нужно войти в аккаунт.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, organization, phone })
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw error;
  return mapProfile(data);
}

export async function listProfiles() {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapProfile);
}

export async function createManager({ fullName, email, password }) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.functions.invoke('create-manager', {
    body: { fullName, email, password },
  });
  if (error) throw new Error(error.message || 'Не удалось создать менеджера.');
  return data;
}

export async function listCourses(currentUser = null) {
  ensureSupabaseConfigured();
  const cacheKey = `courses:list:${currentUser?.id || 'guest'}:${currentUser?.role || 'guest'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { data, error } = await withTimeout(
    supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false }),
    'Supabase не отвечает при загрузке семинаров. Проверьте .env, интернет и что schema.sql выполнен полностью.'
  );

  if (error) throw error;
  return setCached(cacheKey, (data || []).map((row) => mapCourse(row, currentUser)));
}

export async function getCourseBySlug(slug, currentUser = null) {
  ensureSupabaseConfigured();
  const cacheKey = `courses:slug:${slug}:${currentUser?.id || 'guest'}:${currentUser?.role || 'guest'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { data, error } = await withTimeout(
    supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .maybeSingle(),
    'Supabase не отвечает при загрузке семинара. Проверьте подключение и таблицу courses.'
  );

  if (error) throw error;
  if (!data) return null;
  return setCached(cacheKey, mapCourse(data, currentUser));
}

export async function getCourseByUuid(courseId, currentUser = null) {
  ensureSupabaseConfigured();
  const cacheKey = `courses:uuid:${courseId}:${currentUser?.id || 'guest'}:${currentUser?.role || 'guest'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { data, error } = await withTimeout(
    supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle(),
    'Supabase не отвечает при загрузке семинара. Проверьте подключение и таблицу courses.'
  );

  if (error) throw error;
  if (!data) return null;
  return setCached(cacheKey, mapCourse(data, currentUser));
}

export async function getCourseSections(courseUuid) {
  ensureSupabaseConfigured();
  const cacheKey = `sections:${courseUuid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const { data: sections, error: sectionsError } = await withTimeout(
    supabase
      .from('course_sections')
      .select('*')
      .eq('course_id', courseUuid)
      .order('position', { ascending: true }),
    'Supabase не отвечает при загрузке разделов. Проверьте RLS policies для course_sections.'
  );

  if (sectionsError) throw sectionsError;
  const sectionRows = sections || [];
  if (!sectionRows.length) return setCached(cacheKey, []);

  const sectionIds = sectionRows.map((section) => section.id);
  const { data: blocks, error: blocksError } = await withTimeout(
    supabase
      .from('content_blocks')
      .select('*')
      .in('section_id', sectionIds)
      .order('position', { ascending: true }),
    'Supabase не отвечает при загрузке материалов. Проверьте RLS policies для content_blocks.'
  );

  if (blocksError) throw blocksError;

  const mapped = sectionRows.map(mapSection);
  const blocksBySection = new Map();
  (blocks || []).forEach((block) => {
    const list = blocksBySection.get(block.section_id) || [];
    list.push(mapBlock(block));
    blocksBySection.set(block.section_id, list);
  });

  return setCached(cacheKey, mapped.map((section) => ({ ...section, blocks: blocksBySection.get(section.id) || [] })));
}

export async function getCourseForEdit(courseUuid, currentUser = null) {
  const course = await getCourseByUuid(courseUuid, currentUser);
  if (!course) throw new Error('Семинар не найден.');
  const sections = await getCourseSections(course.uuid);
  return { ...course, sections };
}

export async function getCourseForLearning(slug, currentUser) {
  const course = await getCourseBySlug(slug, currentUser);
  if (!course) throw new Error('Семинар не найден.');
  const enrollment = await getEnrollment(course.uuid);
  if (!enrollment && !course.canEdit) {
    throw new Error('Сначала зарегистрируйтесь на семинар, чтобы открыть материалы.');
  }
  const [sections, progress] = await Promise.all([
    getCourseSections(course.uuid),
    listSectionProgress(course.uuid),
  ]);
  return { course, sections, enrollment, progress };
}

function safeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё._-]/gi, '-')
    .replace(/-+/g, '-');
}

export async function uploadCoursePdf(file) {
  ensureSupabaseConfigured();
  if (!file) throw new Error('Файл не выбран.');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) throw new Error('Можно загружать только PDF файлы.');

  const path = `pdf/${Date.now()}-${safeFileName(file.name)}`;

  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from(COURSE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: 'application/pdf',
        upsert: false,
      }),
    'Supabase Storage не отвечает при загрузке PDF. Проверьте bucket course-files и политики Storage.'
  );

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(COURSE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, originalName: file.name };
}

export async function uploadCourseImage(file) {
  ensureSupabaseConfigured();
  if (!file) throw new Error('Файл не выбран.');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const looksLikeImage = allowedTypes.includes(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (!looksLikeImage) throw new Error('Можно загружать только изображения JPG, PNG, WEBP или GIF.');

  const path = `images/${Date.now()}-${safeFileName(file.name)}`;

  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from(COURSE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: false,
      }),
    'Supabase Storage не отвечает при загрузке изображения. Проверьте bucket course-files и политики Storage.'
  );

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(COURSE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, originalName: file.name };
}

export async function saveCourseWithContent(payload, currentUser, existingCourseUuid = null) {
  ensureSupabaseConfigured();
  if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
    throw new Error('Создавать и редактировать семинары могут только админ и менеджер.');
  }

  const row = coursePayloadToRow(payload, existingCourseUuid ? null : currentUser.id);
  let courseUuid = existingCourseUuid;
  let savedCourseRow;

  if (existingCourseUuid) {
    const { data, error } = await supabase
      .from('courses')
      .update(row)
      .eq('id', existingCourseUuid)
      .select('*')
      .single();
    if (error) throw error;
    savedCourseRow = data;
  } else {
    const { data, error } = await supabase
      .from('courses')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    savedCourseRow = data;
    courseUuid = data.id;
  }

  const sections = payload.sections || [];

  if (existingCourseUuid) {
    const { error: deleteError } = await supabase
      .from('course_sections')
      .delete()
      .eq('course_id', courseUuid);
    if (deleteError) throw deleteError;
  }

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const { data: sectionRow, error: sectionError } = await supabase
      .from('course_sections')
      .insert({
        course_id: courseUuid,
        title: section.title || `Раздел ${sectionIndex + 1}`,
        description: section.description || '',
        position: sectionIndex + 1,
      })
      .select('*')
      .single();

    if (sectionError) throw sectionError;

    const blocks = (section.blocks || []).filter((block) => block.type && (block.content || block.title));
    if (blocks.length) {
      const rows = blocks.map((block, blockIndex) => ({
        section_id: sectionRow.id,
        type: block.type,
        title: block.title || '',
        content: block.content || '',
        file_path: block.filePath || null,
        position: blockIndex + 1,
      }));

      const { error: blocksError } = await supabase.from('content_blocks').insert(rows);
      if (blocksError) throw blocksError;
    }
  }

  clearCourseCache();
  return mapCourse(savedCourseRow, currentUser);
}

export async function enrollInCourse(courseUuid) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Нужно войти в аккаунт.');

  const { data, error } = await supabase
    .from('enrollments')
    .upsert({ user_id: user.id, course_id: courseUuid }, { onConflict: 'user_id,course_id' })
    .select('*')
    .single();

  if (error) throw error;
  clearCourseCache();
  return data;
}

export async function getEnrollment(courseUuid) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    'Supabase Auth не отвечает при проверке пользователя.'
  );
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await withTimeout(
    supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseUuid)
      .maybeSingle(),
    'Supabase не отвечает при проверке регистрации на семинар.'
  );

  if (error) throw error;
  return data;
}

export async function listMyEnrollments(currentUser = null) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .from('enrollments')
    .select('*, course:courses(*)')
    .order('enrolled_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    course: mapCourse(row.course, currentUser),
  }));
}

export async function listSectionProgress(courseUuid) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('section_progress')
    .select('*, section:course_sections!inner(course_id)')
    .eq('user_id', user.id)
    .eq('section.course_id', courseUuid);

  if (error) throw error;
  return data || [];
}

export async function markSectionCompleted(sectionId) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Нужно войти в аккаунт.');

  const { data, error } = await supabase
    .from('section_progress')
    .upsert({
      user_id: user.id,
      section_id: sectionId,
      is_completed: true,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,section_id' })
    .select('*')
    .single();

  if (error) throw error;
  clearCourseCache();
  return data;
}

export async function requestCertificate({ course, profile }) {
  ensureSupabaseConfigured();
  const completedAt = new Date().toISOString();
  const durationMatch = String(course.duration || '').match(/\d+(?:[.,]\d+)?/);
  const durationHours = durationMatch ? Number(durationMatch[0].replace(',', '.')) : 40;
  const payload = {
    externalUserId: profile.id,
    fullName: profile.fullName || profile.name,
    courseId: course.slug || course.id || course.uuid,
    courseName: course.title,
    courseType: 'course',
    courseDurationHours: durationHours,
    score: 100,
    completedAt,
    language: 'ru',
  };

  const certificateResponse = await sendCertificateData(payload);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Нужно войти в аккаунт.');

  const { error: enrollmentError } = await supabase
    .from('enrollments')
    .update({ completed_at: completedAt, certificate_requested_at: completedAt })
    .eq('user_id', user.id)
    .eq('course_id', course.uuid);

  if (enrollmentError) throw enrollmentError;

  const { data, error } = await supabase
    .from('certificate_requests')
    .insert({
      user_id: user.id,
      course_id: course.uuid,
      full_name: payload.fullName,
      course_title: payload.courseName,
      completed_at: completedAt,
      payload: {
        request: payload,
        response: certificateResponse,
      },
    })
    .select('*')
    .single();

  if (error) throw error;
  return { ...data, certificateResponse };
}
