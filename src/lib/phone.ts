const VN_MOBILE_REGEX = /^0(3|5|7|8|9)\d{8}$/;

export function isValidVnPhone(phone: string): boolean {
    return VN_MOBILE_REGEX.test(phone);
}
