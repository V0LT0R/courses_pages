import {selectAll} from './pagination';
import { ensureSupabaseConfigured, supabase, withTimeout } from './supabase';
import { sendCertificateData } from './certificateApi';
import { apiRequest, API_URL } from './api';
import { userMessage } from './errors';
import { getCourseTestForEdit } from './testService';
import { withCourseRatings } from './ratingService';

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

export function clearCourseCache() {
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
    academicHours: row.academic_hours ?? null,
    rating: Number(row.rating_summary?.rating ?? 5),
    ratingCount: Number(row.rating_summary?.rating_count ?? 0),
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

  if (error) throw new Error(userMessage(error));
  return mapProfile(data);
}

export async function updateMyProfile({ fullName, organization, phone }) {
  ensureSupabaseConfigured();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Нужно войти в аккаунт.');

  const cleanFullName = String(fullName || '').trim().replace(/\s+/g, ' ');
  const cleanOrganization = String(organization || '').trim();
  const cleanPhone = String(phone || '').trim();
  if (cleanFullName.length < 2 || cleanFullName.length > 120) {
    throw new Error('ФИО должно содержать от 2 до 120 символов.');
  }
  if (cleanOrganization.length > 200) throw new Error('Название организации слишком длинное. Максимум 200 символов.');
  if (cleanPhone.length > 50) throw new Error('Номер телефона слишком длинный. Максимум 50 символов.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: cleanFullName, organization: cleanOrganization, phone: cleanPhone })
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw new Error(userMessage(error));
  return mapProfile(data);
}

export async function listProfiles() {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(userMessage(error));
  return (data || []).map(mapProfile);
}

export async function createManager(input) {
 const {data:{session}}=await supabase.auth.getSession();
 return apiRequest('/admin/managers',{method:'POST',accessToken:session?.access_token,body:JSON.stringify(input)});
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
      .order('created_at', { ascending: false }).limit(1000),
    'Supabase не отвечает при загрузке семинаров. Проверьте .env, интернет и что schema.sql выполнен полностью.'
  );

  if (error) throw new Error(userMessage(error));
  return setCached(cacheKey, (await withCourseRatings(data || [])).map((row) => mapCourse(row, currentUser)));
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

  if (error) throw new Error(userMessage(error));
  if (!data) return null;
  return setCached(cacheKey, mapCourse((await withCourseRatings([data]))[0], currentUser));
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

  if (error) throw new Error(userMessage(error));
  if (!data) return null;
  return setCached(cacheKey, mapCourse((await withCourseRatings([data]))[0], currentUser));
}

export async function getCourseSections(courseUuid) {
  ensureSupabaseConfigured();
  const {data:{session}}=await supabase.auth.getSession();
  const cacheKey = `sections:${courseUuid}:${session?.user?.id||'guest'}`;
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
  const blocks=await selectAll(()=>supabase.from('content_blocks').select('*').in('section_id',sectionIds).order('position').order('id'));

  const paths = [...new Set((blocks||[]).map(b=>b.file_path).filter(Boolean))];
  let signedByPath = new Map();
  if(paths.length){
    for(let i=0;i<paths.length;i+=100){
      const {data,error}=await supabase.storage.from(COURSE_BUCKET).createSignedUrls(paths.slice(i,i+100),3600);
      if(error)throw error;
      for(const item of data||[])signedByPath.set(item.path,item.signedUrl||'');
    }
  }

  const hydratedBlocks=(blocks||[]).map(block=>block.file_path?{...block,content:signedByPath.get(block.file_path)||''}:block);

  const mapped = sectionRows.map(mapSection);
  const blocksBySection = new Map();
  hydratedBlocks.forEach((block) => {
    const list = blocksBySection.get(block.section_id) || [];
    list.push(mapBlock(block));
    blocksBySection.set(block.section_id, list);
  });

  return setCached(cacheKey, mapped.map((section) => ({ ...section, blocks: blocksBySection.get(section.id) || [] })));
}

export async function getCourseForEdit(courseUuid, currentUser = null) {
  const course = await getCourseByUuid(courseUuid, currentUser);
  if (!course) throw new Error('Семинар не найден.');
  const [sections, test] = await Promise.all([
    getCourseSections(course.uuid),
    getCourseTestForEdit(course.uuid),
  ]);
  return { ...course, sections, test };
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

async function uploadCourseFile(file) {
 ensureSupabaseConfigured();
 if(!file||file.size>25*1024*1024)throw new Error('Выберите файл размером не более 25 MB.');
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Нужно войти в аккаунт.');
 const response=await fetch(`${API_URL}/uploads/course-file`,{method:'POST',
   headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/octet-stream'},body:file,
   signal:AbortSignal.timeout(30000)});
 const data=await response.json();
 if(!response.ok)throw new Error(userMessage(data));
 return {...data,originalName:file.name};
}
export const uploadCoursePdf=uploadCourseFile;
export const uploadCourseImage=uploadCourseFile;

export async function saveCourseWithContent(payload, currentUser, existingCourseUuid = null) {
  ensureSupabaseConfigured();
  if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
    throw new Error('Создавать и редактировать семинары могут только админ и менеджер.');
  }

  const rpcPayload = {
    ...payload,
    slug: normalizeSlug(payload.slug || payload.title),
    sections: (payload.sections || []).map((section) => ({
      id: section.id || null,
      title: section.title || '',
      description: section.description || '',
      blocks: (section.blocks || [])
        .filter((block) => block.type && (block.content || block.title || block.filePath))
        .map((block) => ({
          id: block.id || null,
          type: block.type,
          title: block.title || '',
          content: block.content || '',
          filePath: block.filePath || null,
        })),
    })),
  };

  const { data, error } = await supabase.rpc('save_course_with_content', {
    check_course_id: existingCourseUuid,
    check_expected_updated_at: existingCourseUuid ? (payload.expectedUpdatedAt || null) : null,
    check_payload: rpcPayload,
  });

  if (error) {
    const message = error.message || '';
    if (message.includes('COURSE_EDIT_CONFLICT')) {
      throw new Error('Курс уже был изменён в другом окне или на другом компьютере. Обновите страницу и повторите изменения.');
    }
    if (/save_course_with_content|schema cache/i.test(message)) {
      throw new Error('Обновите Supabase: выполните файл supabase/security_hardening_2026.sql в SQL Editor.');
    }
    throw new Error(userMessage(error));
  }

  clearCourseCache();
  return getCourseByUuid(data, currentUser);
}

export async function enrollInCourse(courseUuid) {
  ensureSupabaseConfigured();

  if (!courseUuid) {
    throw new Error('Не удалось определить курс для регистрации. Обновите страницу и попробуйте снова.');
  }

  const { data, error } = await supabase.rpc('enroll_in_course', {
    check_course_id: courseUuid,
  });

  if (error) {
    const message = String(error.message || '');
    const code = String(error.code || '');

    // PGRST202 / schema-cache 404 means the frontend is newer than the DB migration.
    if (code === 'PGRST202' || /enroll_in_course|schema cache/i.test(message)) {
      throw new Error(
        'В Supabase не установлена функция безопасной регистрации на курс. ' +
        'Выполните supabase/fix_enroll_rpc.sql в Supabase SQL Editor и обновите страницу.'
      );
    }

    if (/Course not found/i.test(message)) {
      throw new Error('Курс не найден в базе данных.');
    }

    if (/Authentication required/i.test(message) || code === '42501') {
      throw new Error('Сессия входа истекла. Войдите в кабинет ещё раз.');
    }

    throw new Error(userMessage(error));
  }

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

  if (error) throw new Error(userMessage(error));
  return data;
}

export async function listMyEnrollments(currentUser = null) {
  ensureSupabaseConfigured();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)return [];
  const { data, error } = await supabase
    .from('enrollments')
    .select('*, course:courses(*)')
    .eq('user_id',session.user.id)
    .order('enrolled_at', { ascending: false });

  if (error) throw new Error(userMessage(error));
  const ratedCourses = new Map((await withCourseRatings((data || []).map(row => row.course).filter(Boolean))).map(row => [row.id, row]));
  return (data || []).map((row) => ({
    ...row,
    course: mapCourse(ratedCourses.get(row.course?.id), currentUser),
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

  if (error) throw new Error(userMessage(error));
  return data || [];
}

export async function markSectionCompleted(sectionId) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.rpc('mark_section_completed', {
    check_section_id: sectionId,
  });

  if (error) {
    const message = String(error.message || '');
    const code = String(error.code || '');
    if (code === 'PGRST202' || /mark_section_completed|schema cache/i.test(message)) {
      throw new Error(
        'В Supabase не установлена функция отметки раздела. ' +
        'Выполните supabase/fix_course_progress_rpc.sql в Supabase SQL Editor и обновите страницу.'
      );
    }
    if (/You must be enrolled/i.test(message)) {
      throw new Error('Сначала зарегистрируйтесь на этот курс.');
    }
    if (/Authentication required/i.test(message) || code === '42501') {
      throw new Error('Сессия входа истекла. Войдите в кабинет ещё раз.');
    }
    throw new Error(userMessage(error));
  }
  clearCourseCache();
  return data;
}

export async function requestCertificate({ course }) {
 ensureSupabaseConfigured();
 const {data:{session},error}=await supabase.auth.getSession();
 if(error)throw new Error(userMessage(error));
 if(!session?.access_token)throw new Error('Сессия истекла. Войдите снова.');
 // Issuance, eligibility and completion are now one database transaction.
 const certificateResponse=await sendCertificateData({courseId:course.uuid},session.access_token);
 return {certificateResponse};
}

export async function listMyCertificates() {
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)return [];
 const {data,error}=await supabase.from('certificates').select('certificate_number,course_id,course_title_snapshot,issued_at,status')
 .eq('user_id',session.user.id).order('issued_at',{ascending:false});
 if(error)throw new Error(userMessage(error));return data||[];
}

export async function listCoursePage(currentUser,page=0,pageSize=12,signal){
 const {data,count,error}=await supabase.from('courses').select('*',{count:'exact'}).is('archived_at',null)
 .order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1).abortSignal(signal);
 if(error)throw error;return {items:(await withCourseRatings(data||[],signal)).map(row=>mapCourse(row,currentUser)),count};
}
export async function getMyCourseCertificate(courseId){
 const {data:{session}}=await supabase.auth.getSession();if(!session)return null;
 const {data,error}=await supabase.from('certificates').select('certificate_number,status').eq('user_id',session.user.id).eq('course_id',courseId).maybeSingle();
 if(error)throw error;
 if(!data)return null;
 const base=API_URL.replace(/\/api\/?$/,'');
 return {...data,verify_url:`${base}/verify/${data.certificate_number}`,pdf_url:`${base}/api/certificates/${data.certificate_number}/pdf`};
}
