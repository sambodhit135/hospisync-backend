package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.model.Doctor;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.repository.DoctorRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PatientRecommendService {

    @Autowired
    private HospitalRepository hospitalRepo;

    @Autowired
    private HospitalService hospitalService;

    @Autowired
    private BedCategoryService bedCategoryService;

    @Autowired
    private DoctorRepository doctorRepo;

    private static final double EARTH_RADIUS_KM = 6371.0;
    private static final double MAX_DISTANCE_KM = 25.0;

    public List<PatientHospitalResult> findHospitalsForPatient(
            Double lat, Double lng, String speciality, List<Long> excludeIds, Integer maxDistance) {

        int radius = (maxDistance != null) ? maxDistance : (int) MAX_DISTANCE_KM;

        List<Hospital> all = hospitalRepo.findAll();
        List<Hospital> filtered = all.stream()
                .filter(h -> excludeIds == null || excludeIds.isEmpty() || !excludeIds.contains(h.getId()))
                .collect(Collectors.toList());

        List<PatientHospitalResult> results = new ArrayList<>();

        for (Hospital h : filtered) {
            double dist = haversine(lat, lng, h.getLatitude(), h.getLongitude());
            System.out.println("DEBUG: Hospital: " + h.getHospitalName() + " dist: " + dist);
            if (dist > radius) {
                System.out.println("DEBUG: Hospital " + h.getHospitalName() + " skipped - distance too far (" + dist + " > " + radius + ")");
                continue;
            }

            // Determine relevant available beds
            int availBeds;
            boolean hasRequestedSpeciality = speciality != null && !speciality.isBlank();
            
            if (hasRequestedSpeciality) {
                availBeds = bedCategoryService.getAvailableBedsByCategory(h.getId(), speciality);
                System.out.println("DEBUG: Hospital " + h.getHospitalName() + " speciality beds (" + speciality + "): " + availBeds);
                if (availBeds <= 0) {
                    availBeds = hospitalService.getAvailableBeds(h);
                    System.out.println("DEBUG: Hospital " + h.getHospitalName() + " falling back to total beds: " + availBeds);
                }
            } else {
                availBeds = hospitalService.getAvailableBeds(h);
                System.out.println("DEBUG: Hospital " + h.getHospitalName() + " total beds: " + availBeds);
            }

            if (availBeds <= 0) {
                System.out.println("DEBUG: Hospital " + h.getHospitalName() + " skipped - no beds available");
                continue;
            }

            Long bestDoctorId = null;
            String bestDoctorName = null;
            String bestDoctorSpeciality = null;
            String bestDoctorAvailType = null;
            String bestDoctorShiftStart = null;
            String bestDoctorShiftEnd = null;
            int doctorRemainingCap = 0;
            boolean isNearCapacity = false;

            if (hasRequestedSpeciality) {
                List<Doctor> rawDoctors = doctorRepo.findByHospitalId(h.getId());
                System.out.println("DEBUG: Hospital " + h.getHospitalName() + " raw doctors: " + rawDoctors.size());
                
                List<Doctor> matchingDoctors = rawDoctors.stream()
                        .filter(d -> d.getSpeciality() != null && d.getSpeciality().equalsIgnoreCase(speciality))
                        .collect(Collectors.toList());

                if (matchingDoctors.isEmpty()) {
                    System.out.println("DEBUG: Hospital " + h.getHospitalName() + " skipped - no doctor for speciality: " + speciality);
                    continue; 
                }

                // Pick the best available doctor if any, otherwise pick the first matching one
                List<Doctor> available = matchingDoctors.stream()
                        .filter(d -> Boolean.TRUE.equals(d.getIsAvailable()) && (d.getAvailabilityType() == null || !"OFF_DUTY".equalsIgnoreCase(d.getAvailabilityType())))
                        .collect(Collectors.toList());

                Doctor best = !available.isEmpty() 
                    ? available.stream()
                        .max(java.util.Comparator.comparingInt(d -> (d.getSafeLimit() != null ? d.getSafeLimit() : 12) - (d.getCurrentPatientCount() != null ? d.getCurrentPatientCount() : 0)))
                        .orElse(available.get(0))
                    : matchingDoctors.get(0);

                bestDoctorId = best.getId();
                bestDoctorName = best.getName();
                bestDoctorSpeciality = best.getSpeciality();
                bestDoctorAvailType = best.getAvailabilityType();
                bestDoctorShiftStart = best.getShiftStart();
                bestDoctorShiftEnd = best.getShiftEnd();
                int limit = best.getSafeLimit() != null ? best.getSafeLimit() : 12;
                int count = best.getCurrentPatientCount() != null ? best.getCurrentPatientCount() : 0;
                doctorRemainingCap = limit - count;
                isNearCapacity = doctorRemainingCap <= 2;
            }

            double score = (availBeds * 3.0) - (dist * 2.5) + (doctorRemainingCap * 5.0);

            int travelMin = (int) Math.ceil(dist / 40.0 * 60);
            String travelTime = travelMin < 60 ? travelMin + " min"
                    : (travelMin / 60) + "h " + (travelMin % 60) + " min";

            // FIX 2: Null-safe phone population
            String phone = h.getContactNumber();

            results.add(PatientHospitalResult.builder()
                    .hospitalId(h.getId())
                    .hospitalName(h.getHospitalName())
                    .address(h.getAddress())
                    .latitude(h.getLatitude())
                    .longitude(h.getLongitude())
                    .hospitalLat(h.getLatitude())
                    .hospitalLng(h.getLongitude())
                    .hospitalPhone(phone)
                    .distanceKm(Math.round(dist * 10.0) / 10.0)
                    .estimatedTravelTime(travelTime)
                    .availableBeds(availBeds)
                    .score(Math.round(score * 100.0) / 100.0)
                    .doctorId(bestDoctorId)
                    .availableDoctorName(bestDoctorName)
                    .availableDoctorSpeciality(bestDoctorSpeciality)
                    .doctorAvailabilityType(bestDoctorAvailType)
                    .doctorShiftStart(bestDoctorShiftStart)
                    .doctorShiftEnd(bestDoctorShiftEnd)
                    .doctorRemainingCapacity(doctorRemainingCap)
                    .isNearCapacity(isNearCapacity)
                    .build());
        }

        results.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return results;
    }

    private String normalizeSearchTerm(String term) {
        if (term == null) return "";
        return term.toLowerCase().replace("beds", "").trim();
    }

    private boolean isMatch(String target, String normalizedKeyword) {
        if (target == null || normalizedKeyword.isEmpty()) return false;
        String normalizedTarget = target.toLowerCase().replace("beds", "").trim();
        return normalizedTarget.equals(normalizedKeyword) || normalizedTarget.contains(normalizedKeyword);
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }

    // ─── Inner Result Class ───────────────────────────────────────────────────

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PatientHospitalResult {
        private Long hospitalId;
        private String hospitalName;
        private String address;
        private Long doctorId;
        private String doctorShiftStart;
        private String doctorShiftEnd;
        private String hospitalPhone;
        private Double latitude;
        private Double longitude;
        private Double hospitalLat;
        private Double hospitalLng;
        private Double distanceKm;
        private String estimatedTravelTime;
        private Integer availableBeds;
        private Double score;
        private String availableDoctorName;
        private String availableDoctorSpeciality;
        private String doctorAvailabilityType;
        private Integer doctorRemainingCapacity;
        private Boolean isNearCapacity;
    }
}
