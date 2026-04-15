/** 模擬 API 延遲 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Post {
  id: number;
  userId: number;
  title: string;
}

export interface Comment {
  id: number;
  postId: number;
  body: string;
}

/** 取得使用者資料（模擬 1 秒延遲） */
export async function fetchUser(userId: number): Promise<User> {
  await delay(1000);
  return {
    id: userId,
    name: '鱈魚',
    email: 'codfish@example.com',
  };
}

/** 取得使用者文章列表（模擬 1 秒延遲） */
export async function fetchPostList(userId: number): Promise<Post[]> {
  await delay(1000);
  return [
    { id: 1, userId, title: 'Vue 響應式原理' },
    { id: 2, userId, title: 'Composable 設計模式' },
    { id: 3, userId, title: 'Data Loader 實戰' },
  ];
}

/** 取得文章留言列表（模擬 1 秒延遲） */
export async function fetchCommentList(postId: number): Promise<Comment[]> {
  await delay(1000);
  return [
    { id: 1, postId, body: '寫得很清楚！' },
    { id: 2, postId, body: '感謝分享' },
  ];
}
