// Chi con bat buoc: bat dau bang 0, theo sau du 9 chu so (10 so). Bo yeu cau
// dau so nha mang cu the (03/05/07/08/09) vi da gay tu choi nham nhieu so hop
// le/moi hoac nguoi dung nhap tu do (khong con phu thuoc dau so mang truyen
// thong).
const VN_MOBILE_REGEX = /^0\d{9}$/;

export function isValidVnPhone(phone: string): boolean {
    return VN_MOBILE_REGEX.test(phone);
}
