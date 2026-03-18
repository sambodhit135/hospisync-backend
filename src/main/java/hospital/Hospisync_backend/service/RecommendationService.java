package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.RecommendationResponse;
import hospital.Hospisync_backend.dto.SplitAllocation;
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

    private static final double MAX_DISTANCE_KM = 25.0;
    private static final double EARTH_RADIUS_KM = 6371.0;

    public List<RecommendationResponse> getRecommendations(Long hospitalId, Double maxDistanceKm,
            Map<String, String> allParams) {

        Hospital sourceHospital = hospitalService.getHospital(hospitalId);
        List<Hospital> otherHospitals = hospitalRepository.findAllExcept(hospitalId);

        double limitKm = (maxDistanceKm != null) ? maxDistanceKm : MAX_DISTANCE_KM;

        // Extract bed requirements
        Map<String, Integer> requirements = allParams.entrySet().stream()
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
                        e -> Integer.parseInt(e.getValue())));

        // If no requirements, return empty to avoid confusing the user
        if (requirements.isEmpty() && maxDistanceKm == null) {
            log.info("No filters selected, returning empty recommendation list for hospital {}", hospitalId);
            return new ArrayList<>();
        }

        List<RecommendationResponse> allCandidates = otherHospitals.stream()
                .map(h -> buildRecommendation(sourceHospital, h, requirements))
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
            Map<String, Integer> requirements) {

        double distance = haversine(
                source.getLatitude(),
                source.getLongitude(),
                target.getLatitude(),
                target.getLongitude());

        int totalAvailableBeds = hospitalService.getAvailableBeds(target);

        double occupancyRate = hospitalService.getOccupancyRate(target);

        String utilStatus = hospitalService.getUtilizationStatus(occupancyRate);

        // Score calculation: Balanced between proximity and availability
        // Distance Score: Higher for closer hospitals. Use a smaller floor (0.2) to reward extreme proximity.
        double distanceScore = 150.0 / (distance + 0.2);

        // Calculate specific requirement matching
        double reqScore = 0;
        if (!requirements.isEmpty()) {
            for (Map.Entry<String, Integer> req : requirements.entrySet()) {
                int avail = hospitalService.getAvailableBedsByCategory(target, req.getKey());
                // Weight specifically requested beds more heavily (2.5 points each)
                reqScore += avail * 2.5;
            }
        }

        // Availability Score: 0.2 points per other available bed (lower weight for non-requested categories)
        int requestedAvail = requirements.keySet().stream()
                .mapToInt(k -> hospitalService.getAvailableBedsByCategory(target, k))
                .sum();
        double otherAvailScore = Math.max(0, totalAvailableBeds - requestedAvail) * 0.2;

        // Utilization Score: Prefer underutilized hospitals (up to 30% impact)
        double utilizationScore = (100.0 - occupancyRate) * 0.3;

        double score = distanceScore + reqScore + otherAvailScore + utilizationScore;

        log.info(
                "Hospital: {} | Dist: {} (Score: {}) | ReqMatch: {} | OtherAvail: {} | Occupancy: {}% (Score: {}) | Total: {}",
                target.getHospitalName(),
                distance,
                Math.round(distanceScore * 100.0) / 100.0,
                Math.round(reqScore * 100.0) / 100.0,
                Math.round(otherAvailScore * 100.0) / 100.0,
                Math.round(occupancyRate * 100.0) / 100.0,
                Math.round(utilizationScore * 100.0) / 100.0,
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