package hospital.Hospisync_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SplitAllocation {
    private Long id;
    private String hospitalName;
    private int allocatedBeds;
    private Map<String, Integer> bedAllocations;
}
