package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.RecommendationResponse;
import hospital.Hospisync_backend.dto.SplitAllocation;
import hospital.Hospisync_backend.model.Doctor;
import hospital.Hospisync_backend.repository.DoctorRepository;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.ArrayList;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class RecommendationService {

    private final HospitalRepository hospitalRepository;
    private final HospitalService hospitalService;
    private final DoctorRepository doctorRepository;

    private static final double MAX_DISTANCE_KM = 50.0;
    private static final double EARTH_RADIUS_KM = 6371.0;

    public List<RecommendationResponse> getRecommendations(Long hospitalId, Double maxDistanceKm,
            String speciality, Map<String, String> allParams) {
        return getRecommendations(hospitalId, maxDistanceKm, speciality, allParams, null);
    }

    public List<RecommendationResponse> getRecommendations(Long hospitalId, Double maxDistanceKm,
            String speciality, Map<String, String> allParams, List<Long> excludeHospitalIds) {

        Hospital sourceHospital = hospitalService.getHospital(hospitalId);
        List<Hospital> otherHospitals = hospitalRepository.findAllExcept(hospitalId);

        // FEATURE 4: Never show a hospital that was already tried
        if (excludeHospitalIds != null && !excludeHospitalIds.isEmpty()) {
            otherHospitals = otherHospitals.stream()
                    .filter(h -> !excludeHospitalIds.contains(h.getId()))
                    .collect(Collectors.toList());
        }

        double limitKm = (maxDistanceKm != null) ? maxDistanceKm : MAX_DISTANCE_KM;

        // Extract bed requirements
        Map<String, Integer> requirements = allParams != null ? allParams.entrySet().stream()
                .filter(e -> e.getKey().startsWith("req-"))
                .filter(e -> {
                    try {
                        return Integer.parseInt(e.getValue()) > 0;
                    } catch (NumberFormatException ex) {
                        return false;
                    }
                })
                .collect(Collectors.toMap(
                        e -> e.getKey().substring(4).trim(),
                        e -> Integer.parseInt(e.getValue()))) : new HashMap<>();

        // If no requirements and no distance filter, return empty
        if (requirements.isEmpty() && maxDistanceKm == null && (speciality == null || speciality.isEmpty())
                && (excludeHospitalIds == null || excludeHospitalIds.isEmpty())) {
            log.info("No filters selected, returning empty recommendation list for hospital {}", hospitalId);
            return new ArrayList<>();
        }

        List<RecommendationResponse> allCandidates = otherHospitals.stream()
                .map(h -> buildRecommendation(sourceHospital, h, speciality, requirements))
                .filter(Objects::nonNull)
                .filter(r -> r.getDistance() <= limitKm)
                .sorted(Comparator.comparingDouble(RecommendationResponse::getScore).reversed())
                .collect(Collectors.toList());

        // Single match hospitals (Satisfy ALL requirements)
        List<RecommendationResponse> singleMatches = allCandidates.stream()
                .filter(r -> satisfiesAllRequirements(r, requirements))
                .limit(10)
                .collect(Collectors.toList());

        if (!singleMatches.isEmpty() || requirements.isEmpty()) {
            return singleMatches;
        }

        // Split transfer logic
        if (allCandidates.isEmpty())
            return new ArrayList<>();

        generateSplitTransferPlan(allCandidates, requirements);

        return allCandidates.stream().limit(10).collect(Collectors.toList());
    }

    /** Convenience method for callers who just want the top hospital, excluding tried ones */
    public List<RecommendationResponse> getRecommendationsExcluding(Long hospitalId, Double maxDistanceKm,
            String speciality, List<Long> excludeHospitalIds) {
        return getRecommendations(hospitalId, maxDistanceKm, speciality, new HashMap<>(), excludeHospitalIds);
    }


    private boolean satisfiesAllRequirements(RecommendationResponse rec, Map<String, Integer> requirements) {

        if (requirements.isEmpty())
            return true;

        Hospital target = hospitalService.getHospital(rec.getId());

        for (Map.Entry<String, Integer> req : requirements.entrySet()) {

            int avail = hospitalService.getAvailableBedsByCategory(target, req.getKey());

            if (avail < req.getValue())
                return false;
        }

        return true;
    }

    private void generateSplitTransferPlan(List<RecommendationResponse> recommendations,
            Map<String, Integer> requirements) {

        Map<String, Integer> remainingRequirements = new HashMap<>(requirements);

        List<SplitAllocation> plan = new ArrayList<>();

        for (RecommendationResponse rec : recommendations) {

            boolean hasAnyRemaining = remainingRequirements.values()
                    .stream().anyMatch(v -> v > 0);

            if (!hasAnyRemaining)
                break;

            Hospital target = hospitalService.getHospital(rec.getId());

            Map<String, Integer> allocationsForThisHospital = new HashMap<>();

            int totalAllocatedToThisHospital = 0;

            for (Map.Entry<String, Integer> req : remainingRequirements.entrySet()) {

                if (req.getValue() <= 0)
                    continue;

                int avail = hospitalService.getAvailableBedsByCategory(target, req.getKey());

                if (avail > 0) {

                    int allocate = Math.min(avail, req.getValue());

                    allocationsForThisHospital.put(req.getKey(), allocate);

                    remainingRequirements.put(req.getKey(), req.getValue() - allocate);

                    totalAllocatedToThisHospital += allocate;
                }
            }

            if (totalAllocatedToThisHospital > 0) {

                plan.add(SplitAllocation.builder()
                        .id(rec.getId())
                        .hospitalName(rec.getHospitalName())
                        .allocatedBeds(totalAllocatedToThisHospital)
                        .bedAllocations(allocationsForThisHospital)
                        .build());
            }
        }

        if (!plan.isEmpty()) {
            recommendations.get(0).setSplitTransferPlan(plan);
        }
    }

    private RecommendationResponse buildRecommendation(Hospital source,
            Hospital target,
            String speciality,
            Map<String, Integer> requirements) {

        double distance = haversine(
                source.getLatitude(),
                source.getLongitude(),
                target.getLatitude(),
                target.getLongitude());

        int totalAvailableBeds = hospitalService.getAvailableBeds(target);

        double occupancyRate = hospitalService.getOccupancyRate(target);
        String utilStatus = hospitalService.getUtilizationStatus(occupancyRate);

        // FEATURE 5: Strict Bed Filtering (Patient Safety)
        // Ensure this hospital has at least *some* beds of the requested types.
        if (requirements != null && !requirements.isEmpty()) {
            int matchingAvailableBeds = 0;
            for (Map.Entry<String, Integer> req : requirements.entrySet()) {
                matchingAvailableBeds += hospitalService.getAvailableBedsByCategory(target, req.getKey());
            }
            if (matchingAvailableBeds == 0) {
                // This hospital has ZERO beds that the user explicitly requested! 
                // Do not recommend it at all.
                return null;
            }
        }

        // Doctor availability logic
        String bestDoctorName = null;
        String bestDoctorSpeciality = null;
        Integer doctorRemainingCapacity = null;
        Integer maxTransferablePatients = totalAvailableBeds;
        boolean hasDoctor = false;
        boolean isNearCapacity = false;
        String capacityWarning = null;
        double doctorScore = 0;
        String doctorAvailType = null;
        String docRespTime = null;

        if (speciality != null && !speciality.isEmpty()) {
            List<Doctor> rawDoctors = doctorRepository.findByHospitalIdAndSpecialityAndIsAvailableTrue(target.getId(),
                    speciality);

            // Filter out OFF_DUTY doctors
            List<Doctor> availableDoctors = rawDoctors.stream()
                .filter(d -> !"OFF_DUTY".equals(d.getAvailabilityType()))
                .collect(java.util.stream.Collectors.toList());

            if (availableDoctors.isEmpty()) {
                return null; // Filter out if speciality requested but no available/on-shift doctor
            }

            // Pick the doctor with most remaining capacity
            Doctor bestDoctor = availableDoctors.stream()
                    .max(java.util.Comparator.comparingInt(d -> d.getSafeLimit() - d.getCurrentPatientCount()))
                    .orElse(availableDoctors.get(0));

            hasDoctor = true;
            String typeBadge = "PRESENT".equals(bestDoctor.getAvailabilityType()) ? "🟢 Present" : 
                               "ON_CALL".equals(bestDoctor.getAvailabilityType()) ? "🟡 On-Call (30min)" : "";
            bestDoctorName = bestDoctor.getName() + " (" + bestDoctor.getSpeciality() + ") — " + typeBadge;
            bestDoctorSpeciality = bestDoctor.getSpeciality();
            doctorRemainingCapacity = bestDoctor.getSafeLimit() - bestDoctor.getCurrentPatientCount();
            maxTransferablePatients = Math.min(totalAvailableBeds, Math.max(0, doctorRemainingCapacity));
            doctorAvailType = bestDoctor.getAvailabilityType();
            docRespTime = "PRESENT".equals(doctorAvailType) ? "Immediate" : "ON_CALL".equals(doctorAvailType) ? "30 mins" : "N/A";

            // Score formula components: (doctorCapacity * 2) - (doctorLoad * 1)
            doctorScore = (doctorRemainingCapacity * 2.0) - (bestDoctor.getCurrentPatientCount() * 1.0);
            
            if ("PRESENT".equals(bestDoctor.getAvailabilityType())) {
                doctorScore += 40.0;
            } else if ("ON_CALL".equals(bestDoctor.getAvailabilityType())) {
                doctorScore += 20.0;
            }

            if (doctorRemainingCapacity <= 2) {
                isNearCapacity = true;
                capacityWarning = "High workload: " + bestDoctor.getName() + " is near safe limit.";
            }
        }


        // Balanced scoring formula upgrade
        // bedScore = availability * 3
        double bedScore = totalAvailableBeds * 3.0;

        // distanceScore = - (distance * 2)
        double distanceScore = -(distance * 2.0);

        // utilizationBonus = +15 if hospital is UNDERUTILIZED
        double utilizationBonus = "UNDERUTILIZED".equals(utilStatus) ? 15.0 : 0.0;

        double score = bedScore + doctorScore + distanceScore + utilizationBonus;

        log.info(
                "Hospital: {} | Beds: {} | DoctorScore: {} | Dist: {} | Utilization: {} | Total: {}",
                target.getHospitalName(),
                totalAvailableBeds,
                Math.round(doctorScore * 100.0) / 100.0,
                Math.round(distance * 100.0) / 100.0,
                utilStatus,
                Math.round(score * 100.0) / 100.0);

        int travelMinutes = (int) Math.ceil(distance / 40.0 * 60);

        String travelTime = travelMinutes < 60
                ? travelMinutes + " min"
                : (travelMinutes / 60) + "h " + (travelMinutes % 60) + " min";

        return RecommendationResponse.builder()
                .id(target.getId())
                .hospitalName(target.getHospitalName())
                .address(target.getAddress())
                .distance(Math.round(distance * 10.0) / 10.0)
                .estimatedTravelTime(travelTime)
                .availableBeds(totalAvailableBeds)
                .occupancyRate(Math.round(occupancyRate * 100.0) / 100.0)
                .utilizationStatus(utilStatus)
                .score(Math.round(score * 100.0) / 100.0)
                .availableDoctorName(bestDoctorName)
                .availableDoctorSpeciality(bestDoctorSpeciality)
                .doctorRemainingCapacity(doctorRemainingCapacity)
                .maxTransferablePatients(maxTransferablePatients)
                .hasDoctor(hasDoctor)
                .isNearCapacity(isNearCapacity)
                .capacityWarning(capacityWarning)
                .doctorAvailabilityType(doctorAvailType)
                .doctorResponseTime(docRespTime)
                .build();
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {

        double dLat = Math.toRadians(lat2 - lat1);

        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1))
                        * Math.cos(Math.toRadians(lat2))
                        * Math.sin(dLon / 2)
                        * Math.sin(dLon / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS_KM * c;
    }
}