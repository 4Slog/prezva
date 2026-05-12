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
  template: CertificateTemplatePayload
}

const BASE = 'https://prezva.app'

function renderBody(template: string, props: CertificateProps): string {
  return template
    .replace('{attendee_name}', props.attendeeName)
    .replace('{event_title}', props.eventTitle)
    .replace('{event_date}', props.eventDate)
    .replace('{sessions_attended}', String(props.sessionsAttended))
    .replace('{ce_credit_hours}', String(props.ceCredits))
    .replace('{org_name}', props.orgName)
    .replace('{verification_url}', `${BASE}/verify/${props.verificationId}`)
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
      fontSize: 28,
      fontFamily: 'Helvetica-Bold',
      color: '#1a202c',
      textAlign: 'center',
      marginBottom: 4,
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
          <View style={styles.accentBar} />
          <Text style={styles.subtitle}>Proudly presented to</Text>
        </View>

        <Text style={styles.nameHighlight}>{props.attendeeName}</Text>

        <View style={styles.divider} />

        <Text style={styles.body}>{bodyText}</Text>

        {template.signature_image_url && (
          <View style={styles.signatureArea}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={template.signature_image_url} style={styles.signatureImage} />
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Authorized Signature</Text>
          </View>
        )}

        <Text style={styles.footer}>{footerText}</Text>
      </Page>
    </Document>
  )
}
