import { View, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reporterUserId: string;
  reporterName: string;
  reportedUserId: string;
  reportedName: string;
  audioMessageId?: number;
  audioUrl: string;
  messageType: "comment" | "tarouk";
}

export function ReportModal({
  visible,
  onClose,
  reporterUserId,
  reporterName,
  reportedUserId,
  reportedName,
  audioMessageId,
  audioUrl,
  messageType,
}: ReportModalProps) {
  const colors = useColors();
  const [selectedReason, setSelectedReason] = useState<"offensive_content" | "bad_behavior" | null>(null);
  const [step, setStep] = useState<"choose" | "confirm">("choose");

  const submitMutation = trpc.reports.submit.useMutation({
    onSuccess: () => {
      Alert.alert("تم الإرسال", "تم إرسال بلاغك بنجاح. شكراً لمساعدتنا في الحفاظ على بيئة آمنة.");
      handleClose();
    },
    onError: () => {
      Alert.alert("خطأ", "حدث خطأ أثناء إرسال البلاغ. حاول مرة أخرى.");
    },
  });

  const handleClose = () => {
    setSelectedReason(null);
    setStep("choose");
    onClose();
  };

  const handleSelectReason = (reason: "offensive_content" | "bad_behavior") => {
    setSelectedReason(reason);
    setStep("confirm");
  };

  const handleConfirm = () => {
    if (!selectedReason) return;
    submitMutation.mutate({
      reporterUserId,
      reporterName,
      reportedUserId,
      reportedName,
      audioMessageId,
      audioUrl,
      messageType,
      reason: selectedReason,
    });
  };

  const handleBack = () => {
    setStep("choose");
    setSelectedReason(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 20,
            width: "85%",
            maxWidth: 340,
          }}
          onPress={() => {}}
        >
          {step === "choose" ? (
            <>
              {/* العنوان */}
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 6 }}>
                الإبلاغ عن رسالة
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginBottom: 20 }}>
                اختر سبب البلاغ
              </Text>

              {/* خيار 1 */}
              <TouchableOpacity
                onPress={() => handleSelectReason("offensive_content")}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600", textAlign: "right" }}>
                  محتوى مسيء
                </Text>
                <Text style={{ color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 2 }}>
                  كلام بذيء أو مسيء أو غير لائق
                </Text>
              </TouchableOpacity>

              {/* خيار 2 */}
              <TouchableOpacity
                onPress={() => handleSelectReason("bad_behavior")}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600", textAlign: "right" }}>
                  سلوك سيء
                </Text>
                <Text style={{ color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 2 }}>
                  تصرف غير مناسب أو مزعج
                </Text>
              </TouchableOpacity>

              {/* إلغاء */}
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>إلغاء</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* تأكيد */}
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>⚠️</Text>
                <Text style={{ color: "#F59E0B", fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
                  تنبيه
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                  هل أنت متأكد من هذا البلاغ؟
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 6 }}>
                  البلاغات الكيدية أو الغير صحيحة تعتبر إساءة هي الأخرى.
                </Text>
              </View>

              {/* أزرار */}
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={submitMutation.isPending}
                style={{
                  backgroundColor: "#EF4444",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                  opacity: submitMutation.isPending ? 0.6 : 1,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", textAlign: "center" }}>
                  {submitMutation.isPending ? "جاري الإرسال..." : "نعم، أرسل البلاغ"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={{ padding: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>رجوع</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
