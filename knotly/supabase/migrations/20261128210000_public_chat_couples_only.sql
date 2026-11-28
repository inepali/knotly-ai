-- Public-page chat: only couples own chats. Chats started while signed in as a vendor (e.g. a
-- vendor trying their own page) were linked to the vendor's account; unlink the unclaimed ones.
update vendor_chat_sessions s
   set couple_user_id = null
  from profiles p
 where p.id = s.couple_user_id and p.role <> 'couple' and s.thread_id is null;
