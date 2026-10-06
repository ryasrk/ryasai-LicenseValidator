import { redirect } from 'next/navigation'

// Old address of the dashboard, kept so existing bookmarks still work
export default function Page() {
  redirect('/')
}
