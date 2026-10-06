-- תמונות ההתקדמות עולות עכשיו לענן (bucket פרטי progress-photos, תיקייה לכל משתמש).
-- האפליקציה מכווצת כל תמונה ל-JPEG של עד 900px לפני ההעלאה (בערך 100-300KB) - מגבילים
-- בשרת ל-JPEG בלבד ועד 5MB, כדי שאי אפשר יהיה לנצל את האחסון להעלאת קבצים אחרים.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg']
where id = 'progress-photos';
