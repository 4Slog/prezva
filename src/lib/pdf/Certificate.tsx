import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { CertificateTemplatePayload } from '@/lib/templates/certificates'

export interface CertificateProps {
  attendeeName: string
  eventTitle: string
  eventDate: string
  sessionsAttended: number
  ceCredits: number
  orgName: string
  orgLogoUrl?: string | null
  verificationId: string
  issueDate: string
  template: CertificateTemplatePayload
}

const BASE = 'https://prezva.app'

export function renderBody(template: string, props: CertificateProps): string {
  const values: Record<string, string> = {
    attendee_name: props.attendeeName,
    event_title: props.eventTitle,
    event_date: props.eventDate,
    sessions_attended: String(props.sessionsAttended),
    ce_credit_hours: String(props.ceCredits),
    ce_hours: String(props.ceCredits),
    org_name: props.orgName,
    verification_url: `${BASE}/verify/${props.verificationId}`,
    issue_date: props.issueDate,
  }
  return template.replace(/\{\{?\s*([a-z_]+)\s*\}?\}/gi, (match, key) => {
    const k = String(key).toLowerCase()
    return k in values ? values[k] : match
  })
}

export function Certificate(props: CertificateProps) {
  const { template } = props
  const accent = template.accent_color ?? '#00BFA6'

  const styles = StyleSheet.create({
    page: {
      backgroundColor: '#FFFFFF',
      padding: 48,
      fontFamily: 'Helvetica',
    },
    border: {
      position: 'absolute',
      top: 16,
      left: 16,
      right: 16,
      bottom: 16,
      borderWidth: 3,
      borderColor: accent,
      borderStyle: 'solid',
    },
    header: {
      alignItems: 'center',
      marginBottom: 24,
    },
    logo: {
      width: 64,
      height: 64,
      marginBottom: 8,
      objectFit: 'contain',
    },
    accentBar: {
      height: 4,
      backgroundColor: accent,
      width: 120,
      marginTop: 4,
      marginBottom: 16,
    },
    title: {
      fontSize: accent === '#B8860B' ? 32 : 28,
      fontFamily: 'Helvetica-Bold',
      color: '#1a202c',
      textAlign: 'center',
      marginBottom: 4,
    },
    orgSubtitle: {
      fontSize: 13,
      color: '#4a5568',
      textAlign: 'center',
      marginBottom: 2,
    },
    subtitle: {
      fontSize: 12,
      color: '#718096',
      textAlign: 'center',
    },
    body: {
      fontSize: 14,
      color: '#2d3748',
      textAlign: 'center',
      lineHeight: 1.6,
      marginHorizontal: 40,
      marginVertical: 28,
    },
    nameHighlight: {
      fontSize: 22,
      fontFamily: 'Helvetica-Bold',
      color: accent,
      textAlign: 'center',
      marginVertical: 8,
    },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: '#e2e8f0',
      marginHorizontal: 60,
      marginVertical: 16,
    },
    footer: {
      fontSize: 10,
      color: '#a0aec0',
      textAlign: 'center',
      marginTop: 16,
    },
    signatureArea: {
      alignItems: 'center',
      marginTop: 20,
    },
    signatureImage: {
      width: 120,
      height: 40,
      objectFit: 'contain',
      marginBottom: 4,
    },
    signatureLine: {
      width: 140,
      borderBottomWidth: 1,
      borderBottomColor: '#718096',
      marginBottom: 4,
    },
    signatureLabel: {
      fontSize: 10,
      color: '#718096',
    },
    ceBlock: {
      alignItems: 'center',
      marginVertical: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: accent,
      borderStyle: 'solid',
      marginHorizontal: 60,
    },
    ceLabel: {
      fontSize: 10,
      color: '#718096',
      textAlign: 'center',
      marginBottom: 2,
    },
    ceValue: {
      fontSize: 20,
      fontFamily: 'Helvetica-Bold',
      color: accent,
      textAlign: 'center',
    },
    licensingNote: {
      fontSize: 9,
      color: '#718096',
      textAlign: 'center',
      fontStyle: 'italic',
      marginHorizontal: 60,
      marginBottom: 8,
    },
  })

  const footerText = renderBody(template.footer, props)
  const bodyText = renderBody(template.body, props)

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.border} />

        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {props.orgLogoUrl && <Image src={props.orgLogoUrl} style={styles.logo} />}
          <Text style={styles.title}>{template.title}</Text>
          {template.subtitle ? <Text style={styles.orgSubtitle}>{template.subtitle}</Text> : null}
          <View style={styles.accentBar} />
          <Text style={styles.subtitle}>Proudly presented to</Text>
        </View>

        <Text style={styles.nameHighlight}>{props.attendeeName}</Text>

        <View style={styles.divider} />

        <Text style={styles.body}>{bodyText}</Text>

        {template.ce_credits_field && props.ceCredits > 0 && (
          <View style={styles.ceBlock}>
            <Text style={styles.ceLabel}>Continuing Education Credit Hours</Text>
            <Text style={styles.ceValue}>{props.ceCredits}</Text>
          </View>
        )}

        {template.signature_image_url && (
          <View style={styles.signatureArea}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={template.signature_image_url} style={styles.signatureImage} />
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Authorized Signature</Text>
          </View>
        )}

        {template.licensing_body_note && (
          <Text style={styles.licensingNote}>{template.licensing_body_note}</Text>
        )}

        <Text style={styles.footer}>{footerText}</Text>
      </Page>
    </Document>
  )
}
