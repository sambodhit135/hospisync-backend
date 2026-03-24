package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.DoctorRequestDto;
import hospital.Hospisync_backend.dto.DoctorResponseDto;
import hospital.Hospisync_backend.model.Doctor;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.repository.DoctorRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DoctorService {

    private final DoctorRepository doctorRepository;
    private final HospitalRepository hospitalRepository;

    private Hospital getHospitalFromEmail(String email) {
        System.out.println("DEBUG: getHospitalFromEmail received: [" + email + "]");
        return hospitalRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Hospital not found: " + email));
    }

    @Transactional
    public DoctorResponseDto addDoctor(DoctorRequestDto dto, String email) {
        Hospital hospital = getHospitalFromEmail(email);

        Doctor doctor = Doctor.builder()
                .hospital(hospital)
                .name(dto.getName())
                .email(dto.getEmail())
                .phone(dto.getPhone())
                .speciality(dto.getSpeciality())
                .qualification(dto.getQualification())
                .experienceYears(dto.getExperienceYears())
                .safeLimit(dto.getSafeLimit() != null ? dto.getSafeLimit() : 12)
                .isAvailable(true)
                .currentPatientCount(0)
                .availabilityType(dto.getAvailabilityType() != null ? dto.getAvailabilityType() : "PRESENT")
                .shiftStart(dto.getShiftStart() != null ? dto.getShiftStart() : "08:00")
                .shiftEnd(dto.getShiftEnd() != null ? dto.getShiftEnd() : "16:00")
                .workDays(dto.getWorkDays() != null ? dto.getWorkDays() : "MON,TUE,WED,THU,FRI")
                .build();

        Doctor saved = doctorRepository.save(doctor);
        return mapToResponseDto(saved);
    }

    public List<DoctorResponseDto> getAllDoctors(String email) {
        Hospital hospital = getHospitalFromEmail(email);
        List<Doctor> doctors = doctorRepository.findByHospitalId(hospital.getId());
        return doctors.stream().map(this::mapToResponseDto).collect(Collectors.toList());
    }

    public List<DoctorResponseDto> getDoctorsBySpeciality(String email, String speciality) {
        Hospital hospital = getHospitalFromEmail(email);
        List<Doctor> doctors = doctorRepository.findByHospitalIdAndSpeciality(hospital.getId(), speciality);
        return doctors.stream().map(this::mapToResponseDto).collect(Collectors.toList());
    }

    public List<DoctorResponseDto> getAvailableDoctors(String email) {
        Hospital hospital = getHospitalFromEmail(email);
        List<Doctor> doctors = doctorRepository.findByHospitalIdAndIsAvailableTrue(hospital.getId());
        return doctors.stream().map(this::mapToResponseDto).collect(Collectors.toList());
    }

    @Transactional
    public DoctorResponseDto toggleAvailability(Long doctorId, String email) {
        Hospital hospital = getHospitalFromEmail(email);
        Doctor doctor = doctorRepository.findByIdAndHospitalId(doctorId, hospital.getId())
                .orElseThrow(() -> new RuntimeException("Doctor not found or access denied"));

        doctor.setIsAvailable(!doctor.getIsAvailable());
        Doctor saved = doctorRepository.save(doctor);
        return mapToResponseDto(saved);
    }

    @Transactional
    public DoctorResponseDto updatePatientLoad(Long doctorId, Integer count, String email) {
        Hospital hospital = getHospitalFromEmail(email);
        Doctor doctor = doctorRepository.findByIdAndHospitalId(doctorId, hospital.getId())
                .orElseThrow(() -> new RuntimeException("Doctor not found or access denied"));

        if (count < 0) {
            throw new RuntimeException("Patient count cannot be negative");
        }
        int safeLimit = doctor.getSafeLimit() != null ? doctor.getSafeLimit() : 12;
        if (count > safeLimit) {
            throw new RuntimeException("Cannot exceed safe limit of " + safeLimit + " patients");
        }

        doctor.setCurrentPatientCount(count);
        Doctor saved = doctorRepository.save(doctor);
        return mapToResponseDto(saved);
    }

    @Transactional
    public DoctorResponseDto updateAvailabilityType(Long doctorId, String type, String email) {
        Hospital hospital = getHospitalFromEmail(email);
        Doctor doctor = doctorRepository.findByIdAndHospitalId(doctorId, hospital.getId())
                .orElseThrow(() -> new RuntimeException("Doctor not found or access denied"));
        
        doctor.setAvailabilityType(type);
        Doctor saved = doctorRepository.save(doctor);
        return mapToResponseDto(saved);
    }

    @Transactional
    public void deleteDoctor(Long doctorId, String email) {
        Hospital hospital = getHospitalFromEmail(email);
        Doctor doctor = doctorRepository.findByIdAndHospitalId(doctorId, hospital.getId())
                .orElseThrow(() -> new RuntimeException("Doctor not found or access denied"));

        doctorRepository.delete(doctor);
    }

    public List<DoctorResponseDto> getAvailableDoctorsForTransfer(Long hospitalId, String speciality) {
        List<Doctor> doctors;
        if (speciality != null && !speciality.isBlank()) {
            doctors = doctorRepository.findByHospitalIdAndSpecialityAndIsAvailableTrue(hospitalId, speciality);
        } else {
            doctors = doctorRepository.findByHospitalIdAndIsAvailableTrue(hospitalId);
        }
        return doctors.stream()
                .filter(d -> d.getCurrentPatientCount() < d.getSafeLimit())
                .map(this::mapToResponseDto)
                .collect(Collectors.toList());
    }

    private DoctorResponseDto mapToResponseDto(Doctor doctor) {
        String availabilityType = doctor.getAvailabilityType() != null ? doctor.getAvailabilityType() : "PRESENT";
        String color = "green";
        if ("ON_CALL".equals(availabilityType)) color = "amber";
        if ("OFF_DUTY".equals(availabilityType)) color = "red";

        DoctorResponseDto dto = DoctorResponseDto.builder()
                .id(doctor.getId())
                .name(doctor.getName())
                .email(doctor.getEmail())
                .phone(doctor.getPhone())
                .speciality(doctor.getSpeciality())
                .qualification(doctor.getQualification())
                .experienceYears(doctor.getExperienceYears())
                .isAvailable(doctor.getIsAvailable())
                .currentPatientCount(doctor.getCurrentPatientCount())
                .safeLimit(doctor.getSafeLimit())
                .availabilityType(availabilityType)
                .shiftInfo(formatShiftInfo(doctor))
                .availabilityColor(color)
                .build();
        dto.calculateCapacity();
        return dto;
    }

    private String formatShiftInfo(Doctor doctor) {
        if (doctor.getWorkDays() == null || doctor.getShiftStart() == null || doctor.getShiftEnd() == null) {
            return "N/A";
        }
        
        String days = doctor.getWorkDays();
        if ("MON,TUE,WED,THU,FRI".equals(days)) {
            days = "Mon-Fri";
        } else if ("SAT,SUN".equals(days)) {
            days = "Sat-Sun";
        } else {
            days = Arrays.stream(days.split(","))
                         .map(d -> d.length() > 0 ? d.substring(0, 1) + d.substring(1).toLowerCase() : d)
                         .collect(Collectors.joining(","));
        }
        
        try {
            java.time.format.DateTimeFormatter inputFormat = java.time.format.DateTimeFormatter.ofPattern("HH:mm");
            java.time.format.DateTimeFormatter outputFormat = java.time.format.DateTimeFormatter.ofPattern("h:mm a");
            
            String startFormatted = java.time.LocalTime.parse(doctor.getShiftStart(), inputFormat).format(outputFormat);
            String endFormatted = java.time.LocalTime.parse(doctor.getShiftEnd(), inputFormat).format(outputFormat);
            
            return days + ", " + startFormatted + "-" + endFormatted;
        } catch (Exception e) {
            return days + ", " + doctor.getShiftStart() + "-" + doctor.getShiftEnd();
        }
    }
}
