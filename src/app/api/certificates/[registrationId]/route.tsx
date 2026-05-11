import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#0D1B2A',
    padding: 60,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  border: {
    border: '4px solid #00BFA6',
    padding: 40,
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 16,
  },
  cert: {
    fontSize: 28,
    color: '#00BFA6',
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  name: {
    fontSize: 36,
    color: '#F0F4F8',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 4,
  },
  event: {
    fontSize: 20,
    color: '#F0F4F8',
    textAlign: 'center',
    marginBottom: 24,
  },
  date: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 24,
  },
  divider: {
    borderTop: '1px solid #1E3A5F',
    width: '60%',
    marginVertical: 20,
  },
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  const { registrationId } = await params
  const url = new URL(req.url)
  const tokenParam = url.searchParams.get('token')

  const supabase = await createClient()
  const user = await supabase.auth.getUser()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, attendee_name, certificate_token, event_id, events(title, start_date)')
    .eq('id', registrationId)
    .single()

  if (!reg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow access if authenticated owner OR valid token param
  const isOwner = user.data.user && (reg as any).user_id === user.data.user.id
  const hasToken = tokenParam && tokenParam === (reg as any).certificate_token
  if (!isOwner && !hasToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const eventTitle = (reg as any).events?.title ?? 'Event'
  const attendeeName = (reg as any).attendee_name ?? 'Attendee'
  const eventDate = (reg as any).events?.start_date
    ? new Date((reg as any).events.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  const buffer = await renderToBuffer(
    <Document title={`Certificate — ${attendeeName}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          <Text style={styles.title}>Certificate of Attendance</Text>
          <View style={styles.divider} />
          <Text style={styles.cert}>This certifies that</Text>
          <Text style={styles.name}>{attendeeName}</Text>
          <Text style={styles.sub}>attended</Text>
          <Text style={styles.event}>{eventTitle}</Text>
          <View style={styles.divider} />
          <Text style={styles.date}>{eventDate}</Text>
          <Text style={{ ...styles.date, marginTop: 8, fontSize: 10, color: '#1E3A5F' }}>Powered by Prezva</Text>
        </View>
      </Page>
    </Document>
  )

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${attendeeName.replace(/\s+/g, '-')}.pdf"`,
    },
  })
}
