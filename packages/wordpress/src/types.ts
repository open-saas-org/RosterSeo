export interface WordPressPost {
  id: number;
  title: string;
  link: string;
  status: string;
  date: string;
}

export interface WordPressNewPost {
  title: string;
  content: string; // HTML
  status?: "publish" | "draft";
}
